/* Comandi: tastiera e pulsanti a schermo, con la stessa interfaccia. */
(function () {
  "use strict";

  const KEY_LEFT = ["ArrowLeft", "a", "A"];
  const KEY_RIGHT = ["ArrowRight", "d", "D"];
  const KEY_UP = ["ArrowUp", "w", "W"];
  const KEY_DOWN = ["ArrowDown", "s", "S"];
  const KEY_JUMP = [" ", "ArrowUp", "w", "W", "z", "Z"];

  class Input {
    constructor() {
      this.left = false;
      this.right = false;
      this.up = false;
      this.down = false;
      this.jump = false;
      this.jumpPressed = false;
      this._held = {};
      this._touch = { left: false, right: false, jump: false, down: false };
      this.onAction = null;      // Invio / tocco: conferma
      this.onKey = null;         // altri tasti (P, M, R)
      this.onGesture = null;     // primo gesto: sblocca l'audio
    }

    attach(target) {
      window.addEventListener("keydown", (ev) => {
        if (ev.repeat) { ev.preventDefault(); return; }
        this._gesture();
        if (this._set(ev.key, true)) ev.preventDefault();
        if (ev.key === "Enter" || ev.key === " ") {
          if (this.onAction) this.onAction();
          ev.preventDefault();
        }
        if (this.onKey) this.onKey(ev.key);
      });
      window.addEventListener("keyup", (ev) => { this._set(ev.key, false); });
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

    _set(key, down) {
      let used = false;
      [KEY_LEFT, KEY_RIGHT, KEY_UP, KEY_DOWN, KEY_JUMP].forEach((list) => {
        if (list.indexOf(key) >= 0) used = true;
      });
      if (used) this._held[key] = down;
      this._sync();
      return used;
    }

    _any(list) {
      for (const k of list) if (this._held[k]) return true;
      return false;
    }

    _sync() {
      const jumpNow = this._any(KEY_JUMP) || this._touch.jump;
      this.left = this._any(KEY_LEFT) || this._touch.left;
      this.right = this._any(KEY_RIGHT) || this._touch.right;
      this.up = this._any(KEY_UP);
      this.down = this._any(KEY_DOWN) || this._touch.down;
      if (jumpNow && !this.jump) this.jumpPressed = true;
      this.jump = jumpNow;
    }

    /** Da chiamare a fine frame: il salto "appena premuto" dura un solo frame. */
    endFrame() { this.jumpPressed = false; }
  }

  window.Input = Input;
})();
