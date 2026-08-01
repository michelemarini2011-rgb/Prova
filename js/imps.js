/* Spiritelli: volteggiano, l'onda d'urto li sbalza e li stordisce, poi cadono. */
(function () {
  "use strict";

  const TILE = window.Arena.TILE;
  const FRAME = 48;
  const ROW = { float: 0, stunned: 1, alert: 2 };

  const ALERT_TIME = 1.4;        // preavviso prima che il torpore finisca
  const GRAVITY = 1500;
  const GROUND_FRICTION = 900;
  const HOVER_MIN = 26;          // quanto volteggiano sopra la testa del nano
  const HOVER_MAX = 60;          // sempre dentro la portata verticale del martello
  const DIVE_TIME = 0.8;         // durata di una picchiata
  const CEILING = 44;

  class Imp {
    constructor(arena, x, y, speed, stunTime) {
      this.arena = arena;
      this.r = 13;
      this.homeX = x;
      this.homeY = y;
      this.speed = speed;
      this.stunTime = stunTime;
      this.reset();
    }

    reset() {
      this.x = this.homeX;
      this.y = this.homeY;
      this.vx = (Math.random() < 0.5 ? -1 : 1) * this.speed;
      this.vy = 0;
      this.state = "roam";
      this.stun = 0;
      this.anim = Math.random() * 4;
      this.bob = Math.random() * Math.PI * 2;
      this.phase = Math.random() * Math.PI * 2;
      this.diveIn = 2.5 + Math.random() * 3.5;
      this.dive = 0;
      this.hover = HOVER_MIN + Math.random() * (HOVER_MAX - HOVER_MIN);
      this.flee = 0;
      this.grounded = false;
      this.boxed = false;
    }

    get stunned() { return this.state === "stunned" || this.state === "carried"; }
    get aboutToWake() { return this.stunned && this.stun < ALERT_TIME; }

    /** Colpito dall'onda d'urto: vola indietro e resta stordito. */
    shock(fromX, fromY, power, stunTime) {
      const a = Math.atan2(this.y - fromY - 8, this.x - fromX);
      this.vx = Math.cos(a) * power;
      this.vy = Math.min(-120, Math.sin(a) * power);   // sempre un po' verso l'alto
      this.stun = stunTime;
      if (this.state !== "carried") this.state = "stunned";
      this.grounded = false;
      this.flee = 0;
    }

    breakFree(dwarf) {
      this.state = "roam";
      this.flee = 1.6;
      this.grounded = false;
      this.vx = (this.x < dwarf.cx ? -1 : 1) * this.speed * 2.2;
      this.vy = -220;
    }

    update(dt, dwarf) {
      this.anim += dt * (this.stunned ? 4 : 6);
      if (this.flee > 0) this.flee -= dt;

      if (this.state === "carried") {
        this.stun -= dt;
        const bx = dwarf.cx - dwarf.facing * 30;
        const by = dwarf.feet - this.r - 2;
        this.x += (bx - this.x) * Math.min(1, dt * 11);
        this.y += (by - this.y) * Math.min(1, dt * 11);
        return;
      }

      if (this.state === "stunned") {
        this.stun -= dt;
        this.vy = Math.min(700, this.vy + GRAVITY * dt);
        this.moveAndCollide(dt);
        if (this.grounded) {
          const fr = GROUND_FRICTION * dt;
          this.vx = Math.abs(this.vx) <= fr ? 0 : this.vx - Math.sign(this.vx) * fr;
        }
        if (this.stun <= 0) {
          this.state = "roam";
          this.vy = -180;
          this.grounded = false;
        }
        return;
      }

      // volteggia sopra la testa del nano e ogni tanto gli piomba addosso
      this.bob += dt * 2.6;
      const flee = this.flee > 0;
      if (this.dive > 0) this.dive -= dt;
      else if (!flee && (this.diveIn -= dt) <= 0) {
        this.dive = DIVE_TIME;
        this.diveIn = 2.5 + Math.random() * 3.5;
      }
      const diving = this.dive > 0;
      const tx = dwarf.cx + (diving ? 0 : Math.sin(this.bob * 0.7 + this.phase) * 46);
      const ty = diving ? dwarf.cy : dwarf.y - this.hover + Math.sin(this.bob) * 10;
      const sgn = flee ? -1 : 1;
      this.vx += (tx - this.x) * sgn * dt * (diving ? 5.0 : 2.6);
      this.vy += (ty - this.y) * sgn * dt * (diving ? 6.0 : 3.4);
      const sp = Math.hypot(this.vx, this.vy) || 1;
      const max = this.speed * (flee ? 2.4 : diving ? 2.6 : 1.5);
      if (sp > max) { this.vx = (this.vx / sp) * max; this.vy = (this.vy / sp) * max; }
      this.moveAndCollide(dt);
      if (this.y < CEILING) { this.y = CEILING; this.vy = Math.abs(this.vy) * 0.5; }
    }

    /** Collisione a cerchio contro le celle solide (le assi fermano solo dall'alto). */
    moveAndCollide(dt) {
      const r = this.r;
      this.x += this.vx * dt;
      let tx0 = Math.floor((this.x - r) / TILE), tx1 = Math.floor((this.x + r) / TILE);
      let ty0 = Math.floor((this.y - r) / TILE), ty1 = Math.floor((this.y + r) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!this.arena.isSolid(tx, ty)) continue;
          if (this.vx > 0) this.x = tx * TILE - r;
          else if (this.vx < 0) this.x = (tx + 1) * TILE + r;
          this.vx = -this.vx * 0.5;
          break;
        }
      }
      const prevBottom = this.y + r;
      this.y += this.vy * dt;
      this.grounded = false;
      ty0 = Math.floor((this.y - r) / TILE); ty1 = Math.floor((this.y + r) / TILE);
      tx0 = Math.floor((this.x - r) / TILE); tx1 = Math.floor((this.x + r) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const solid = this.arena.isSolid(tx, ty);
          const oneway = this.arena.isOneWay(tx, ty);
          if (!solid && !oneway) continue;
          // da stordito attraversa le assi: finisce sempre a terra, raggiungibile
          if (oneway && (this.stunned || this.vy <= 0 || prevBottom > ty * TILE + 6)) continue;
          // il tetto del macchinario non è un appoggio: si scivola giù a sinistra
          if (this.arena.underMachine(tx, ty) && this.vy > 0) {
            this.vx -= 260 * dt;
            continue;
          }
          if (this.vy > 0) {
            this.y = ty * TILE - r;
            this.grounded = true;
            this.vy = this.stunned ? 0 : -Math.abs(this.vy) * 0.4;
          } else if (this.vy < 0 && solid) {
            this.y = (ty + 1) * TILE + r;
            this.vy = 0;
          }
          return;
        }
      }
    }

    draw(ctx, time) {
      const img = window.Assets.img.imps;
      let row = ROW.float;
      if (this.stunned) row = (this.aboutToWake && Math.floor(time * 9) % 2 === 0) ? ROW.alert : ROW.stunned;
      else if (this.dive > 0) row = ROW.alert;      // in picchiata cambia faccia
      const frame = Math.floor(this.anim) % 4;
      ctx.drawImage(img, frame * FRAME, row * FRAME, FRAME, FRAME,
        Math.round(this.x - FRAME / 2), Math.round(this.y - FRAME / 2), FRAME, FRAME);

      if (this.stunned && this.stunTime > 0) {
        const t = Math.max(0, this.stun / this.stunTime);
        ctx.save();
        ctx.lineWidth = 4.5;
        ctx.strokeStyle = "rgba(40,26,50,0.5)";
        ctx.beginPath();
        ctx.arc(this.x, this.y - 22, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = this.aboutToWake ? "rgba(255,90,80,1)" : "rgba(255,226,90,1)";
        ctx.beginPath();
        ctx.arc(this.x, this.y - 22, 12, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  Imp.ALERT_TIME = ALERT_TIME;
  window.Imp = Imp;
})();
