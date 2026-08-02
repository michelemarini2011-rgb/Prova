/* Avvio e ciclo di gioco. */
(function () {
  "use strict";

  let game = null;

  function toggleSound() {
    const on = !window.Sfx.enabled;
    window.Sfx.setEnabled(on);
    const btn = document.getElementById("btn-sound");
    if (btn) {
      btn.textContent = on ? "♪ audio" : "✕ audio";
      btn.setAttribute("aria-pressed", String(on));
    }
  }

  function boot() {
    const canvas = document.getElementById("game");
    const loading = document.getElementById("loading");
    const bar = document.getElementById("loading-bar");

    window.Assets.load((p) => { if (bar) bar.style.width = Math.round(p * 100) + "%"; })
      .then(() => {
        if (loading) loading.classList.add("hidden");

        const input = new window.Input();
        input.onGesture = () => { window.Sfx.init(); window.Sfx.resume(); };
        game = new window.Game(canvas, input);
        input.attach(canvas);
        window.__game = game;

        const prevKey = input.onKey;
        input.onKey = (key) => {
          if (prevKey) prevKey(key);
          if (key === "m" || key === "M") toggleSound();
        };

        // la vista si adatta allo spazio disponibile e all'orientamento
        const screen = document.querySelector(".screen") || canvas.parentElement;
        const fit = () => {
          const r = screen.getBoundingClientRect();
          game.resize(Math.max(260, Math.round(r.width)), Math.max(220, Math.round(r.height)));
        };
        fit();
        window.addEventListener("resize", fit);
        window.addEventListener("orientationchange", () => setTimeout(fit, 250));
        if (window.visualViewport) window.visualViewport.addEventListener("resize", fit);

        const pause = document.getElementById("btn-pause");
        if (pause) pause.addEventListener("click", () => game.togglePause());
        const restart = document.getElementById("btn-restart");
        if (restart) restart.addEventListener("click", () => game.restart());
        const sound = document.getElementById("btn-sound");
        if (sound) sound.addEventListener("click", toggleSound);

        const STEP = 1 / 120;
        let last = performance.now();
        let acc = 0;
        function frame(now) {
          let dt = (now - last) / 1000;
          last = now;
          if (dt > 0.25) dt = 0.25;
          acc += dt;
          let guard = 0;
          while (acc >= STEP && guard++ < 60) {
            game.update(STEP);
            input.endFrame();
            acc -= STEP;
          }
          game.draw();
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      })
      .catch((err) => {
        if (loading) loading.textContent = "Errore nel caricamento: " + err.message;
        console.error(err);
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
