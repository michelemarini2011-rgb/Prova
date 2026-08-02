/* Comandi: tastiera e pulsanti a schermo, con la stessa interfaccia. */
(function () {
  "use strict";

  const MAP = {
    left: ["ArrowLeft", "a", "A"],
    right: ["ArrowRight", "d", "D"],
    up: ["ArrowUp", "w", "W"],
    down: ["ArrowDown", "s", "S"],
    jump: [" ", "ArrowUp", "w", "W"],
    action: ["x", "X", "z", "Z", "Control"]
  };

  // Un dito non cade mai esattamente dentro il pulsante: si accetta un margine,
  // più generoso in verticale perché il pollice arriva dal basso.
  const SLOP_X = 6;
  const SLOP_Y = 14;

  class Input {
    constructor() {
      this.left = this.right = this.up = this.down = false;
      this.jump = false;
      this.jumpPressed = false;
      this.action = false;
      this.actionPressed = false;
      this._held = {};
      this._touch = { left: false, right: false, down: false, jump: false, action: false };
      this._mouse = null;         // pulsante premuto col mouse, se c'è
      this._buttons = [];         // pulsanti a schermo, per il test di collisione
      this._rects = null;         // loro posizioni, rilette a ogni premuta
      this._padIds = new Set();   // dita partite da un pulsante
      this._lastDir = "right";    // se sinistra e destra sono premute insieme
      this._rawLeft = false;
      this._rawRight = false;
      this.onAction = null;
      this.onKey = null;
      this.onGesture = null;
    }

    attach(target) {
      window.addEventListener("keydown", (ev) => {
        this._gesture();
        if (ev.repeat) { if (this._known(ev.key)) ev.preventDefault(); return; }
        if (this._set(ev.key, true)) ev.preventDefault();
        if (ev.key === "Enter" || ev.key === " ") {
          if (this.onAction) this.onAction();
          ev.preventDefault();
        }
        if (this.onKey) this.onKey(ev.key);
      });
      window.addEventListener("keyup", (ev) => this._set(ev.key, false));
      window.addEventListener("blur", () => { this._held = {}; this._sync(); });

      this._buttons = Array.from(document.querySelectorAll("[data-btn]"));

      // I pulsanti a schermo non si ascoltano uno per uno: a ogni evento si
      // ricalcola lo stato da tutti i tocchi vivi. Così far scorrere il pollice
      // da ◀ a ▶ funziona (il tocco resta legato al primo pulsante, quindi il
      // secondo non riceverebbe mai un touchstart) e un touchend perso non può
      // lasciare un tasto incollato.
      const touched = (ev) => {
        // Le posizioni si rileggono a ogni premuta, non solo quando il browser
        // ci avvisa: la barra degli indirizzi che compare o scompare sposta i
        // pulsanti senza che arrivi sempre un resize, e con misure vecchie il
        // tocco finirebbe accanto al tasto invece che dentro.
        if (ev.type === "touchstart") this._measure();

        const held = { left: false, right: false, down: false, jump: false, action: false };
        for (const t of ev.touches) {
          const name = this._hit(t.clientX, t.clientY);
          if (name) held[name] = true;
        }
        this._touch = held;
        this._sync();

        // Si annulla il gesto solo per le dita partite dal pad: un dito
        // appoggiato su una freccia non deve impedire di toccare pausa o lo
        // schermo con l'altra mano. (touchcancel non è annullabile.)
        let mine = false;
        for (const t of ev.changedTouches) {
          if (ev.type === "touchstart") {
            if (this._hit(t.clientX, t.clientY)) { this._padIds.add(t.identifier); mine = true; }
          } else if (this._padIds.has(t.identifier)) {
            mine = true;
            if (ev.type !== "touchmove") this._padIds.delete(t.identifier);
          }
        }
        if (mine && ev.cancelable) ev.preventDefault();
      };
      for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
        window.addEventListener(type, (ev) => {
          if (type === "touchstart") this._gesture();
          touched(ev);
        }, { passive: false });
      }

      // col mouse (prova da scrivania) basta il pulsante sotto il puntatore
      const mouse = (ev, down) => {
        if (down) this._measure();
        this._mouse = down ? this._hit(ev.clientX, ev.clientY) : null;
        if (down) this._gesture();
        this._sync();
      };
      window.addEventListener("mousedown", (ev) => mouse(ev, true));
      window.addEventListener("mouseup", (ev) => mouse(ev, false));
      window.addEventListener("mouseleave", (ev) => mouse(ev, false));

      if (target) {
        target.addEventListener("touchstart", (ev) => {
          this._gesture();
          if (this.onAction) this.onAction();
          ev.preventDefault();
        }, { passive: false });
      }
    }

    _gesture() { if (this.onGesture) this.onGesture(); }

    _known(key) {
      for (const name in MAP) if (MAP[name].indexOf(key) >= 0) return true;
      return false;
    }

    _set(key, down) {
      const known = this._known(key);
      if (known) this._held[key] = down;
      this._sync();
      return known;
    }

    _any(list) {
      for (const k of list) if (this._held[k]) return true;
      return false;
    }

    /** Posizioni dei pulsanti: leggerle a ogni touchmove costerebbe un reflow. */
    _measure() {
      this._rects = this._buttons.map((btn) => {
        const r = btn.getBoundingClientRect();
        return { name: btn.dataset.btn, l: r.left, r: r.right, t: r.top, b: r.bottom,
                 cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2,
                 live: r.width > 0 && r.height > 0 };      // il pad è nascosto da CSS
      });
      return this._rects;
    }

    /** Pulsante a schermo sotto il punto dato: il più vicino, con un margine. */
    _hit(x, y) {
      const rects = this._rects || this._measure();
      let best = null, bestD = Infinity;
      for (const r of rects) {
        if (!r.live) continue;
        if (x < r.l - SLOP_X || x > r.r + SLOP_X) continue;
        if (y < r.t - SLOP_Y || y > r.b + SLOP_Y) continue;
        const d = Math.hypot(x - r.cx, y - r.cy);
        if (d < bestD) { bestD = d; best = r.name; }
      }
      return best;
    }

    _pressed(name) {
      return this._touch[name] || this._mouse === name;
    }

    /** Il pulsante si accende davvero quando è premuto: senza, col tocco
        preventDefault toglie anche il :active e non si capisce se ha preso. */
    _paint() {
      for (const btn of this._buttons) {
        btn.classList.toggle("on", !!this._pressed(btn.dataset.btn));
      }
    }

    _sync() {
      const left = this._any(MAP.left) || this._pressed("left");
      const right = this._any(MAP.right) || this._pressed("right");
      // premute insieme, vince l'ultima arrivata: altrimenti si annullerebbero
      // e il nano resterebbe fermo proprio mentre si preme un tasto
      if (left && !this._rawLeft) this._lastDir = "left";
      if (right && !this._rawRight) this._lastDir = "right";
      this._rawLeft = left;
      this._rawRight = right;
      if (left && right) {
        this.left = this._lastDir === "left";
        this.right = this._lastDir === "right";
      } else {
        this.left = left;
        this.right = right;
      }

      this.up = this._any(MAP.up) || this._pressed("up");
      this.down = this._any(MAP.down) || this._pressed("down");
      const jumpNow = this._any(MAP.jump) || this._pressed("jump");
      if (jumpNow && !this.jump) this.jumpPressed = true;
      this.jump = jumpNow;
      const now = this._any(MAP.action) || this._pressed("action");
      if (now && !this.action) this.actionPressed = true;
      this.action = now;
      this._paint();
    }

    /** A fine frame: "appena premuto" vale un solo frame. */
    endFrame() { this.actionPressed = false; this.jumpPressed = false; }
  }

  window.Input = Input;
})();
