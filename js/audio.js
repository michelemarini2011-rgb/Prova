/* Suoni sintetizzati con la Web Audio API: nessun file audio nel progetto. */
(function () {
  "use strict";

  const Sfx = {
    ctx: null,
    master: null,
    enabled: true,

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.3 : 0;
      this.master.connect(this.ctx.destination);
    },

    resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },

    setEnabled(on) {
      this.enabled = on;
      if (this.master) this.master.gain.value = on ? 0.3 : 0;
    },

    tone(freq, dur, type, gain, slideTo, delay) {
      if (!this.ctx || !this.enabled) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain || 0.25, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    },

    noise(dur, gain, freq, delay, type) {
      if (!this.ctx || !this.enabled) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = type || "lowpass";
      filter.frequency.value = freq || 800;
      const g = this.ctx.createGain();
      g.gain.value = gain || 0.2;
      src.connect(filter).connect(g).connect(this.master);
      src.start(t0);
    },

    /** Colpo sordo sulla roccia più uno squillo metallico. */
    hammer() {
      this.tone(120, 0.16, "square", 0.26, 42);
      this.noise(0.20, 0.30, 620);
      this.tone(880, 0.09, "triangle", 0.10, 520, 0.01);
    },
    stun() {
      [740, 620, 520, 440].forEach((f, i) => this.tone(f, 0.16, "sine", 0.13, null, i * 0.05));
    },
    grab() { this.tone(320, 0.1, "triangle", 0.18, 470); },
    drop() { this.tone(300, 0.1, "triangle", 0.15, 190); },
    free() {
      this.tone(300, 0.28, "sawtooth", 0.2, 720);
      this.noise(0.2, 0.14, 1500, 0, "highpass");
    },
    box() {
      this.noise(0.12, 0.24, 900);
      this.tone(160, 0.14, "square", 0.2, 90, 0.04);
      [523, 659, 784].forEach((f, i) => this.tone(f, 0.16, "sine", 0.16, null, 0.1 + i * 0.06));
    },
    hurt() { this.tone(260, 0.3, "sawtooth", 0.22, 90); },
    lose() {
      [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.34, "triangle", 0.2, f * 0.7, i * 0.14));
    },
    portal() {
      [262, 330, 392, 523, 659].forEach((f, i) => this.tone(f, 0.5, "sine", 0.16, null, i * 0.1));
    },
    enterPortal() { this.tone(220, 0.7, "sine", 0.22, 1320); },
    start() {
      [196, 262, 330].forEach((f, i) => this.tone(f, 0.28, "square", 0.16, null, i * 0.11));
    }
  };

  window.Sfx = Sfx;
})();
