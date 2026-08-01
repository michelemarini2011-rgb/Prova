/* Comandi: tastiera e pulsanti a schermo, con la stessa interfaccia. */
(function () {
  "use strict";

  const MAP = {
    left: ["ArrowLeft", "a", "A"],
    right: ["ArrowRight", "d", "D"],
    up: ["ArrowUp", "w", "W"],
    down: ["ArrowDown", "s", "S"],
    action: [" ", "z", "Z", "Control"]
  };

  class Input {
    constructor() {
      this.left = this.right = this.up = this.down = false;
      this.action = false;
      this.actionPressed = false;
      this._held = {};
      this._touch = { left: false, right: false, up: false, down: false, action: false };
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

      document.querySelectorAll("[data-btn]").forEach((btn) => {
        const name = btn.dataset.btn;
        const on = (ev) => { this._gesture(); this._touch[name] = true; this._sync(); ev.preventDefault(); };
        const off = (ev) => { this._touch[name] = false; this._sync(); ev.preventDefault(); };
        btn.addEventListener("touchstart", on, { passive: false });
        btn.addEventListener("touchend", off, { passive: false });
        btn.addEventListener("touchcancel", off, { passive: false });
        btn.addEventListener("mousedown", on);
        btn.addEventListener("mouseup", off);
        btn.addEventListener("mouseleave", off);
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

    _sync() {
      this.left = this._any(MAP.left) || this._touch.left;
      this.right = this._any(MAP.right) || this._touch.right;
      this.up = this._any(MAP.up) || this._touch.up;
      this.down = this._any(MAP.down) || this._touch.down;
      const now = this._any(MAP.action) || this._touch.action;
      if (now && !this.action) this.actionPressed = true;
      this.action = now;
    }

    /** A fine frame: "appena premuto" vale un solo frame. */
    endFrame() { this.actionPressed = false; }
  }

  window.Input = Input;
})();
