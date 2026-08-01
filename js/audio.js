/* Effetti sonori sintetizzati con la Web Audio API: nessun file audio esterno. */
(function () {
  "use strict";

  const Sfx = {
    ctx: null,
    master: null,
    enabled: true,
    sirenMode: "off",
    _siren: null,
    _wakaFlip: false,

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.35 : 0;
      this.master.connect(this.ctx.destination);
    },

    resume() {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    },

    setEnabled(on) {
      this.enabled = on;
      if (this.master) this.master.gain.value = on ? 0.35 : 0;
      if (!on) this.setSiren("off");
    },

    /** Nota semplice con inviluppo. */
    tone(freq, dur, type, gain, slideTo, delay) {
      if (!this.ctx || !this.enabled) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain || 0.3, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },

    waka() {
      this._wakaFlip = !this._wakaFlip;
      const f = this._wakaFlip ? 420 : 300;
      this.tone(f, 0.08, "square", 0.18, f * 0.6);
    },

    power() {
      this.tone(180, 0.35, "sawtooth", 0.22, 700);
    },

    eatGhost() {
      [330, 440, 550, 660, 880].forEach((f, i) => this.tone(f, 0.09, "square", 0.22, null, i * 0.06));
    },

    fruit() {
      [660, 880, 1100].forEach((f, i) => this.tone(f, 0.12, "triangle", 0.25, null, i * 0.08));
    },

    extraLife() {
      [880, 1100, 1320, 1760].forEach((f, i) => this.tone(f, 0.14, "square", 0.2, null, i * 0.1));
    },

    death() {
      if (!this.ctx || !this.enabled) return;
      for (let i = 0; i < 8; i++) {
        this.tone(700 - i * 70, 0.16, "square", 0.22, 260 - i * 25, i * 0.13);
      }
    },

    levelClear() {
      [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, "triangle", 0.22, null, i * 0.14));
    },

    start() {
      [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.18, "square", 0.2, null, i * 0.15));
    },

    /** Sirena di sottofondo: "normal" | "fright" | "eyes" | "off". */
    setSiren(mode) {
      if (!this.ctx) return;
      if (mode === this.sirenMode) return;
      this.sirenMode = mode;
      if (this._siren) {
        this._siren.osc.stop(this.ctx.currentTime + 0.05);
        this._siren.lfo.stop(this.ctx.currentTime + 0.05);
        this._siren = null;
      }
      if (mode === "off" || !this.enabled) return;

      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();

      const cfg = {
        normal: { base: 200, depth: 90, rate: 3.2, type: "sawtooth", vol: 0.05 },
        fright: { base: 130, depth: 40, rate: 8.0, type: "square", vol: 0.05 },
        eyes: { base: 620, depth: 240, rate: 12.0, type: "triangle", vol: 0.04 }
      }[mode];

      osc.type = cfg.type;
      osc.frequency.value = cfg.base;
      lfo.type = "sine";
      lfo.frequency.value = cfg.rate;
      lfoGain.gain.value = cfg.depth;
      lfo.connect(lfoGain).connect(osc.frequency);
      g.gain.value = cfg.vol;
      osc.connect(g).connect(this.master);
      osc.start();
      lfo.start();
      this._siren = { osc, lfo };
    }
  };

  window.Sfx = Sfx;
})();
