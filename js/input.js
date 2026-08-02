/* Comandi: tastiera, pulsanti a schermo e joypad, con la stessa interfaccia. */
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

  // ------------------------------------------------------------------ joypad
  // Un pad Bluetooth accoppiato col sistema il browser lo vede come un gamepad
  // qualunque: non c'è niente di specifico per il Bluetooth. Gli indici sono
  // quelli della disposizione "standard", in cui il browser normalizza i pad
  // per posizione — il tasto 0 è sempre quello in basso, comunque si chiami.
  const PAD = {
    left: { keys: [14], axis: 0, dir: -1 },      // croce sinistra o levetta
    right: { keys: [15], axis: 0, dir: 1 },
    up: { keys: [12], axis: 1, dir: -1 },
    down: { keys: [13], axis: 1, dir: 1 },
    jump: { keys: [0] },                          // il tasto in basso (A)
    action: { keys: [1, 2, 3, 5, 7] }             // gli altri frontali e i dorsali destri
  };
  const DEADZONE = 0.4;      // sotto, la levetta è considerata a riposo
  const PAD_PAUSE = 9;       // start

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
      this._pad = { left: false, right: false, up: false, down: false,
                    jump: false, action: false };
      this._padWasJump = false;
      this._padWasPause = false;
      this._padHeld = false;      // c'è qualcosa premuto sul pad
      this.padActive = false;     // c'è un joypad collegato e lo si sta usando
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

      // Il joypad si legge a ogni fotogramma (vedi poll), ma il browser avvisa
      // quando compare: i browser lo tengono nascosto finché non si preme un
      // tasto, quindi questo evento arriva proprio al primo comando.
      window.addEventListener("gamepadconnected", () => { this.padActive = true; });
      window.addEventListener("gamepaddisconnected", () => {
        this.padActive = false;
        this._pad = { left: false, right: false, up: false, down: false,
                      jump: false, action: false };
        this._sync();
      });

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
      return this._touch[name] || this._mouse === name || this._pad[name];
    }

    /**
     * Il joypad non manda eventi: va letto a ogni fotogramma. Lo chiama il
     * ciclo di gioco prima di aggiornare il mondo.
     */
    poll() {
      if (!navigator.getGamepads) return;
      let pads;
      try { pads = navigator.getGamepads(); } catch (e) { return; }

      const held = { left: false, right: false, up: false, down: false,
                     jump: false, action: false };
      let connected = false, pause = false;
      for (const gp of pads) {
        if (!gp || !gp.connected) continue;
        connected = true;
        for (const name in PAD) {
          const m = PAD[name];
          for (const k of m.keys) {
            const b = gp.buttons[k];
            if (b && (b.pressed || b.value > 0.5)) held[name] = true;
          }
          if (m.axis !== undefined) {
            const v = gp.axes[m.axis];
            if (typeof v === "number" && v * m.dir > DEADZONE) held[name] = true;
          }
        }
        const p = gp.buttons[PAD_PAUSE];
        if (p && p.pressed) pause = true;
      }
      // Niente pad e niente rimasto premuto: si esce senza toccare lo stato. Se
      // invece qualcosa era premuto quando il pad si è scollegato bisogna
      // passare di qui a rilasciarlo, o resterebbe incollato.
      if (!connected && !this.padActive && !this._padHeld) return;
      this.padActive = connected;

      this._padHeld = false;
      for (const name in held) if (held[name]) this._padHeld = true;

      // il tasto in basso vale anche come "conferma", come la barra spaziatrice
      if (held.jump && !this._padWasJump) {
        this._gesture();
        if (this.onAction) this.onAction();
      }
      this._padWasJump = held.jump;
      if (pause && !this._padWasPause && this.onKey) this.onKey("p");
      this._padWasPause = pause;

      this._pad = held;
      this._sync();
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
