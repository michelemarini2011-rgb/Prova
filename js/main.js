/* Avvio, ciclo di gioco e gestione dei comandi (tastiera, tocco, pulsanti). */
(function () {
  "use strict";

  const KEYS = {
    ArrowRight: 0, ArrowDown: 1, ArrowLeft: 2, ArrowUp: 3,
    d: 0, s: 1, a: 2, w: 3,
    D: 0, S: 1, A: 2, W: 3
  };

  let game = null;

  function firstGesture() {
    window.Sfx.init();
    window.Sfx.resume();
  }

  function bindKeyboard() {
    window.addEventListener("keydown", (ev) => {
      firstGesture();
      const dir = KEYS[ev.key];
      if (dir !== undefined) {
        game.onDirection(dir);
        ev.preventDefault();
        return;
      }
      if (ev.key === "Enter" || ev.key === " ") {
        game.onConfirm();
        ev.preventDefault();
      } else if (ev.key === "p" || ev.key === "P") {
        game.togglePause();
      } else if (ev.key === "m" || ev.key === "M") {
        toggleSound();
      }
    });
  }

  function toggleSound() {
    const on = !window.Sfx.enabled;
    window.Sfx.setEnabled(on);
    const btn = document.getElementById("btn-sound");
    if (btn) {
      btn.textContent = on ? "🔊 Audio" : "🔇 Audio";
      btn.setAttribute("aria-pressed", String(on));
    }
  }

  function bindTouch(canvas) {
    let sx = 0, sy = 0, active = false;

    canvas.addEventListener("touchstart", (ev) => {
      firstGesture();
      const t = ev.changedTouches[0];
      sx = t.clientX; sy = t.clientY; active = true;
      if (game.state === "title" || game.state === "gameover") game.onConfirm();
      ev.preventDefault();
    }, { passive: false });

    canvas.addEventListener("touchmove", (ev) => {
      if (!active) return;
      const t = ev.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.hypot(dx, dy) < 24) return;
      active = false;
      if (Math.abs(dx) > Math.abs(dy)) game.onDirection(dx > 0 ? 0 : 2);
      else game.onDirection(dy > 0 ? 1 : 3);
      ev.preventDefault();
    }, { passive: false });

    canvas.addEventListener("touchend", () => { active = false; }, { passive: true });

    document.querySelectorAll("[data-dir]").forEach((btn) => {
      const dir = Number(btn.dataset.dir);
      const press = (ev) => { firstGesture(); game.onDirection(dir); ev.preventDefault(); };
      btn.addEventListener("touchstart", press, { passive: false });
      btn.addEventListener("mousedown", press);
    });
  }

  function bindButtons() {
    const start = document.getElementById("btn-start");
    if (start) start.addEventListener("click", () => { firstGesture(); game.onConfirm(); });
    const pause = document.getElementById("btn-pause");
    if (pause) pause.addEventListener("click", () => game.togglePause());
    const sound = document.getElementById("btn-sound");
    if (sound) sound.addEventListener("click", toggleSound);
  }

  function loop() {
    const STEP = 1 / 120;
    let last = performance.now();
    let acc = 0;
    function frame(now) {
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.25) dt = 0.25;
      acc += dt;
      let guard = 0;
      while (acc >= STEP && guard++ < 60) { game.update(STEP); acc -= STEP; }
      game.draw();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function boot() {
    const canvas = document.getElementById("game");
    const loading = document.getElementById("loading");
    const bar = document.getElementById("loading-bar");

    window.Assets.load((p) => { if (bar) bar.style.width = Math.round(p * 100) + "%"; })
      .then(() => {
        if (loading) loading.classList.add("hidden");
        game = new window.Game(canvas);
        window.__game = game;
        bindKeyboard();
        bindTouch(canvas);
        bindButtons();
        document.addEventListener("pointerdown", firstGesture, { once: true });
        loop();
      })
      .catch((err) => {
        if (loading) loading.textContent = "Errore nel caricamento degli asset: " + err.message;
        console.error(err);
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
