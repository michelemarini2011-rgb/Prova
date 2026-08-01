/* Spiritelli: vagano, si stordiscono con l'onda d'urto, si lasciano trascinare. */
(function () {
  "use strict";

  const FRAME = 48;
  const ROW = { float: 0, stunned: 1, alert: 2 };

  const ALERT_TIME = 1.4;        // preavviso prima che il torpore finisca
  const FRICTION = 460;

  class Imp {
    constructor(arena, x, y, speed, stunTime) {
      this.arena = arena;
      this.r = 12;
      this.bounce = 0.7;
      this.homeX = x;
      this.homeY = y;
      this.speed = speed;
      this.stunTime = stunTime;
      this.reset();
    }

    reset() {
      this.x = this.homeX;
      this.y = this.homeY;
      const a = Math.random() * Math.PI * 2;
      this.vx = Math.cos(a) * this.speed;
      this.vy = Math.sin(a) * this.speed;
      this.state = "roam";
      this.stun = 0;
      this.anim = Math.random() * 4;
      this.wander = Math.random() * Math.PI * 2;
      this.flee = 0;
      this.boxed = false;
    }

    get stunned() { return this.state === "stunned" || this.state === "carried"; }
    get aboutToWake() { return this.stunned && this.stun < ALERT_TIME; }

    /** Colpito dall'onda d'urto: rimbalza indietro e resta stordito. */
    shock(fromX, fromY, power, stunTime) {
      const a = Math.atan2(this.y - fromY, this.x - fromX);
      this.vx = Math.cos(a) * power;
      this.vy = Math.sin(a) * power;
      this.stun = stunTime;
      if (this.state !== "carried") this.state = "stunned";
      this.flee = 0;
    }

    breakFree(dwarf) {
      this.state = "roam";
      this.flee = 1.6;
      const a = Math.atan2(this.y - dwarf.y, this.x - dwarf.x);
      this.vx = Math.cos(a) * this.speed * 2.2;
      this.vy = Math.sin(a) * this.speed * 2.2;
    }

    update(dt, dwarf) {
      this.anim += dt * (this.state === "stunned" || this.state === "carried" ? 4 : 6);
      if (this.flee > 0) this.flee -= dt;

      if (this.state === "carried") {
        this.stun -= dt;
        // segue il nano restando indietro
        const bx = dwarf.x - dwarf.dir.x * 26;
        const by = dwarf.y - dwarf.dir.y * 26 + 4;
        this.x += (bx - this.x) * Math.min(1, dt * 12);
        this.y += (by - this.y) * Math.min(1, dt * 12);
        return;
      }

      if (this.state === "stunned") {
        this.stun -= dt;
        const sp = Math.hypot(this.vx, this.vy);
        if (sp > 0) {
          const k = Math.max(0, sp - FRICTION * dt) / sp;
          this.vx *= k;
          this.vy *= k;
        }
        this.arena.move(this, this.vx * dt, this.vy * dt);
        if (this.stun <= 0) {
          this.state = "roam";
          const a = Math.random() * Math.PI * 2;
          this.vx = Math.cos(a) * this.speed;
          this.vy = Math.sin(a) * this.speed;
        }
        return;
      }

      // vagabondaggio con una lieve attrazione verso il nano
      this.wander += (Math.random() - 0.5) * dt * 9;
      let ax = Math.cos(this.wander) * 130;
      let ay = Math.sin(this.wander) * 130;
      const dx = dwarf.x - this.x, dy = dwarf.y - this.y;
      const dist = Math.hypot(dx, dy) || 1;
      const pull = this.flee > 0 ? -260 : 62;
      ax += (dx / dist) * pull;
      ay += (dy / dist) * pull;

      this.vx += ax * dt;
      this.vy += ay * dt;
      const target = this.speed * (this.flee > 0 ? 2.0 : 1.0);
      const sp = Math.hypot(this.vx, this.vy) || 1;
      if (sp > target) { this.vx = (this.vx / sp) * target; this.vy = (this.vy / sp) * target; }
      this.arena.move(this, this.vx * dt, this.vy * dt);
    }

    draw(ctx, time) {
      const img = window.Assets.img.imps;
      let row = ROW.float;
      if (this.stunned) row = (this.aboutToWake && Math.floor(time * 9) % 2 === 0) ? ROW.alert : ROW.stunned;
      const frame = Math.floor(this.anim) % 4;
      ctx.drawImage(img, frame * FRAME, row * FRAME, FRAME, FRAME,
        Math.round(this.x - FRAME / 2), Math.round(this.y - FRAME / 2), FRAME, FRAME);

      // anello che mostra quanto torpore resta
      if (this.stunned && this.stunTime > 0) {
        const t = Math.max(0, this.stun / this.stunTime);
        ctx.save();
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(10,8,16,0.55)";          // contorno scuro: si legge ovunque
        ctx.beginPath();
        ctx.arc(this.x, this.y + 17, 15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = this.aboutToWake ? "rgba(255,110,100,1)" : "rgba(255,226,130,0.95)";
        ctx.beginPath();
        ctx.arc(this.x, this.y + 17, 15, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  Imp.ALERT_TIME = ALERT_TIME;
  window.Imp = Imp;
})();
