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

    /** Fruscio breve, per passi e atterraggi. */
    noise(dur, gain, freq, delay) {
      if (!this.ctx || !this.enabled) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = freq || 900;
      const g = this.ctx.createGain();
      g.gain.value = gain || 0.2;
      src.connect(filter).connect(g).connect(this.master);
      src.start(t0);
    },

    jump() { this.tone(300, 0.16, "triangle", 0.2, 620); },
    land() { this.noise(0.11, 0.16, 700); },
    collect(streak) {
      const base = 660 * Math.pow(1.0595, Math.min(12, streak || 0) * 2);
      this.tone(base, 0.13, "sine", 0.22);
      this.tone(base * 1.5, 0.1, "sine", 0.12, null, 0.05);
    },
    lantern() {
      [392, 523, 659, 880].forEach((f, i) => this.tone(f, 0.5, "sine", 0.16, null, i * 0.09));
    },
    stomp() {
      this.tone(180, 0.12, "square", 0.22, 70);
      this.noise(0.09, 0.14, 500);
    },
    hurt() {
      this.tone(330, 0.3, "sawtooth", 0.2, 110);
    },
    death() {
      [440, 370, 294, 220].forEach((f, i) => this.tone(f, 0.32, "triangle", 0.2, f * 0.7, i * 0.13));
    },
    levelClear() {
      [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.42, "sine", 0.2, null, i * 0.14));
    },
    door() { this.tone(196, 0.6, "sine", 0.18, 392); },
    start() {
      [392, 494, 587].forEach((f, i) => this.tone(f, 0.3, "sine", 0.18, null, i * 0.12));
    }
  };

  window.Sfx = Sfx;
})();
