/* Il nano: si muove in otto direzioni, martella il terreno, trascina spiritelli. */
(function () {
  "use strict";

  const FRAME = 64;

  const SPEED = 172;
  const SPEED_DRAG = 142;        // trascinando si va più piano
  const ACCEL = 1500;
  const FRICTION = 1900;

  const SWING_TIME = 0.42;       // durata della martellata
  const SWING_HIT = 0.19;        // istante in cui il martello tocca terra
  const REACH = 30;              // distanza del punto d'impatto davanti al nano
  const SHOCK_R = 78;            // raggio dell'onda d'urto

  // righe di dwarf.png: cammina giù/lato/su, martella giù/lato/su
  const ROW = { walkDown: 0, walkSide: 1, walkUp: 2, hitDown: 3, hitSide: 4, hitUp: 5 };

  class Dwarf {
    constructor(arena) {
      this.arena = arena;
      this.r = 11;
      this.reset(arena.start);
    }

    reset(pos) {
      this.x = pos.x;
      this.y = pos.y;
      this.vx = 0;
      this.vy = 0;
      this.dir = { x: 0, y: 1 };
      this.facing = "down";
      this.anim = 0;
      this.swing = 0;
      this.swungAt = false;
      this.carrying = null;
      this.invuln = 0;
      this.hitFlash = 0;
    }

    get swinging() { return this.swing > 0; }

    /** Punto in cui cade il martello. */
    impactPoint() {
      return { x: this.x + this.dir.x * REACH, y: this.y + this.dir.y * REACH + 6 };
    }

    hurt(fromX, fromY) {
      if (this.invuln > 0) return false;
      this.invuln = 1.5;
      const a = Math.atan2(this.y - fromY, this.x - fromX);
      this.vx = Math.cos(a) * 300;
      this.vy = Math.sin(a) * 300;
      this.hitFlash = 0.3;
      return true;
    }

    update(dt, input, game) {
      if (this.invuln > 0) this.invuln -= dt;
      if (this.hitFlash > 0) this.hitFlash -= dt;

      let ix = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      let iy = (input.up ? -1 : 0) + (input.down ? 1 : 0);
      const len = Math.hypot(ix, iy);
      if (len > 0) { ix /= len; iy /= len; }

      // il martello si usa sempre: trascinando serve a rinnovare il torpore
      if (input.actionPressed && !this.swinging) {
        this.swing = SWING_TIME;
        this.swungAt = false;
      }

      if (this.swinging) {
        const before = this.swing;
        this.swing -= dt;
        if (!this.swungAt && before > SWING_TIME - SWING_HIT && this.swing <= SWING_TIME - SWING_HIT) {
          this.swungAt = true;
          game.onHammer(this.impactPoint());
        }
        ix *= 0.15;                       // martellando ci si muove appena
        iy *= 0.15;
      } else if (len > 0) {
        this.dir = { x: ix, y: iy };
        this.facing = Math.abs(ix) > Math.abs(iy) ? (ix > 0 ? "right" : "left")
          : (iy > 0 ? "down" : "up");
      }

      const maxSpeed = (this.carrying ? SPEED_DRAG : SPEED) * (this.swinging ? 0.25 : 1);
      const target = { x: ix * maxSpeed, y: iy * maxSpeed };
      this.vx += Math.max(-ACCEL * dt, Math.min(ACCEL * dt, target.x - this.vx));
      this.vy += Math.max(-ACCEL * dt, Math.min(ACCEL * dt, target.y - this.vy));
      if (ix === 0) this.vx -= Math.sign(this.vx) * Math.min(Math.abs(this.vx), FRICTION * dt);
      if (iy === 0) this.vy -= Math.sign(this.vy) * Math.min(Math.abs(this.vy), FRICTION * dt);

      this.arena.move(this, this.vx * dt, this.vy * dt);

      const moving = Math.hypot(this.vx, this.vy) > 18;
      this.anim += dt * (moving ? 7 : 3.2);
    }

    draw(ctx) {
      if (this.invuln > 0 && Math.floor(this.invuln * 16) % 2 === 0 && this.invuln < 1.35) return;
      const img = window.Assets.img.dwarf;
      let row, frame;
      if (this.swinging) {
        const t = 1 - this.swing / SWING_TIME;
        frame = Math.min(3, Math.floor(t * 4));
        row = this.facing === "up" ? ROW.hitUp : this.facing === "down" ? ROW.hitDown : ROW.hitSide;
      } else {
        frame = Math.floor(this.anim) % 4;
        row = this.facing === "up" ? ROW.walkUp : this.facing === "down" ? ROW.walkDown : ROW.walkSide;
      }
      const dx = Math.round(this.x - FRAME / 2);
      const dy = Math.round(this.y - FRAME + 12);
      ctx.save();
      if (this.hitFlash > 0) ctx.filter = "brightness(1.8) saturate(0.4)";
      if (this.facing === "left") {
        ctx.translate(dx + FRAME, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(img, frame * FRAME, row * FRAME, FRAME, FRAME, 0, 0, FRAME, FRAME);
      } else {
        ctx.drawImage(img, frame * FRAME, row * FRAME, FRAME, FRAME, dx, dy, FRAME, FRAME);
      }
      ctx.restore();
    }
  }

  Dwarf.SHOCK_R = SHOCK_R;
  Dwarf.REACH = REACH;
  window.Dwarf = Dwarf;
})();
