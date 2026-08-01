/* Il nano, di profilo: corre, salta, martella il terreno, trascina spiritelli. */
(function () {
  "use strict";

  const TILE = window.Arena.TILE;
  const FRAME = 64;

  const RUN = 196;
  const RUN_DRAG = 134;          // trascinando si va più piano
  const ACCEL_GROUND = 2200;
  const ACCEL_AIR = 1400;
  const FRICTION_GROUND = 2600;
  const FRICTION_AIR = 700;
  const GRAVITY = 2000;
  const MAX_FALL = 900;
  const JUMP_V = 620;            // circa 3 celle di altezza
  const CUT_V = 190;
  const COYOTE = 0.10;
  const BUFFER = 0.13;

  const SWING_TIME = 0.42;
  const SWING_HIT = 0.19;
  const REACH = 30;              // distanza del punto d'impatto davanti al nano
  const SHOCK_RX = 122;          // semiasse orizzontale dell'onda d'urto
  const SHOCK_RY = 96;           // semiasse verticale: arriva a chi vola basso

  // righe di dwarf.png
  const ROW = { idle: 0, walk: 1, hammer: 2, air: 3 };
  const AIR = { jump: 0, fall: 1, drag: 2 };

  class Dwarf {
    constructor(arena) {
      this.arena = arena;
      this.w = 24;
      this.h = 30;
      this.reset(arena.start);
    }

    reset(pos) {
      this.x = pos.x - this.w / 2;
      this.y = pos.y - this.h;
      this.vx = 0;
      this.vy = 0;
      this.facing = 1;
      this.onGround = false;
      this.onOneWay = false;
      this.coyote = 0;
      this.buffer = 0;
      this.jumping = false;
      this.dropTimer = 0;
      this.anim = 0;
      this.swing = 0;
      this.swungAt = false;
      this.carrying = null;
      this.invuln = 0;
      this.hitFlash = 0;
    }

    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }
    get feet() { return this.y + this.h; }
    get swinging() { return this.swing > 0; }

    /** Punto in cui cade il martello: davanti ai piedi. */
    impactPoint() {
      return { x: this.cx + this.facing * REACH, y: this.feet - 6 };
    }

    hurt(fromX) {
      if (this.invuln > 0) return false;
      this.invuln = 1.5;
      this.vx = (this.cx < fromX ? -1 : 1) * 260;
      this.vy = -240;
      this.hitFlash = 0.3;
      return true;
    }

    update(dt, input, game) {
      if (this.invuln > 0) this.invuln -= dt;
      if (this.hitFlash > 0) this.hitFlash -= dt;
      if (this.dropTimer > 0) this.dropTimer -= dt;

      // il martello si usa sempre: trascinando rinnova il torpore
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
      }

      let dir = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      if (this.swinging) dir *= 0.2;                 // martellando ci si muove appena
      else if (dir !== 0) this.facing = dir > 0 ? 1 : -1;

      const maxSpeed = this.carrying ? RUN_DRAG : RUN;
      const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;
      if (dir !== 0) {
        this.vx += dir * accel * dt;
        this.vx = Math.max(-maxSpeed, Math.min(maxSpeed, this.vx));
      } else {
        const fr = (this.onGround ? FRICTION_GROUND : FRICTION_AIR) * dt;
        this.vx = Math.abs(this.vx) <= fr ? 0 : this.vx - Math.sign(this.vx) * fr;
      }

      // salto con coyote time e buffer
      if (input.jumpPressed) this.buffer = BUFFER;
      if (this.buffer > 0) this.buffer -= dt;
      if (this.coyote > 0) this.coyote -= dt;
      if (this.buffer > 0 && (this.onGround || this.coyote > 0)) {
        if (input.down && this.onOneWay) {
          this.dropTimer = 0.22;
          this.onGround = false;
        } else {
          this.vy = -JUMP_V;
          this.jumping = true;
          game.onJump();
        }
        this.buffer = 0;
        this.coyote = 0;
      }
      if (this.jumping && !input.jump && this.vy < -CUT_V) this.vy = -CUT_V;
      if (this.vy >= 0) this.jumping = false;

      this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);

      const wasOnGround = this.onGround;
      this.moveX(this.vx * dt);
      this.moveY(this.vy * dt);
      if (this.onGround) this.coyote = COYOTE;
      if (this.onGround && !wasOnGround) game.onLand(this);

      this.anim += dt * (Math.abs(this.vx) > 14 ? Math.abs(this.vx) / 24 : 4);
    }

    tiles() {
      return {
        x0: Math.floor(this.x / TILE), x1: Math.floor((this.x + this.w - 1) / TILE),
        y0: Math.floor(this.y / TILE), y1: Math.floor((this.y + this.h - 1) / TILE)
      };
    }

    moveX(dx) {
      this.x += dx;
      const t = this.tiles();
      for (let ty = t.y0; ty <= t.y1; ty++) {
        for (let tx = t.x0; tx <= t.x1; tx++) {
          if (!this.arena.isSolid(tx, ty)) continue;
          if (dx > 0) this.x = tx * TILE - this.w;
          else if (dx < 0) this.x = (tx + 1) * TILE;
          this.vx = 0;
          return;
        }
      }
    }

    moveY(dy) {
      const prevBottom = this.y + this.h;
      this.y += dy;
      this.onGround = false;
      this.onOneWay = false;
      const t = this.tiles();
      for (let ty = t.y0; ty <= t.y1; ty++) {
        for (let tx = t.x0; tx <= t.x1; tx++) {
          const solid = this.arena.isSolid(tx, ty);
          const oneway = this.arena.isOneWay(tx, ty);
          if (!solid && !oneway) continue;
          if (oneway) {
            if (dy <= 0 || this.dropTimer > 0) continue;
            if (prevBottom > ty * TILE + 6) continue;
          }
          if (dy > 0) {
            this.y = ty * TILE - this.h;
            this.onGround = true;
            this.onOneWay = oneway;
          } else if (dy < 0) {
            if (oneway) continue;
            this.y = (ty + 1) * TILE;
          }
          this.vy = 0;
          return;
        }
      }
    }

    draw(ctx) {
      if (this.invuln > 0 && Math.floor(this.invuln * 16) % 2 === 0 && this.invuln < 1.35) return;
      const img = window.Assets.img.dwarf;
      let row, frame;
      if (this.swinging) {
        row = ROW.hammer;
        frame = Math.min(3, Math.floor((1 - this.swing / SWING_TIME) * 4));
      } else if (!this.onGround) {
        row = ROW.air;
        frame = this.vy < 0 ? AIR.jump : AIR.fall;
      } else if (this.carrying) {
        row = ROW.air;
        frame = AIR.drag + (Math.abs(this.vx) > 14 ? Math.floor(this.anim) % 2 : 0);
      } else if (Math.abs(this.vx) > 14) {
        row = ROW.walk;
        frame = Math.floor(this.anim) % 6;
      } else {
        row = ROW.idle;
        frame = Math.floor(this.anim) % 2;
      }
      const dx = Math.round(this.cx - FRAME / 2);
      const dy = Math.round(this.feet - FRAME + 6);
      ctx.save();
      if (this.hitFlash > 0) ctx.filter = "brightness(1.7) saturate(0.5)";
      if (this.facing < 0) {
        ctx.translate(dx + FRAME, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(img, frame * FRAME, row * FRAME, FRAME, FRAME, 0, 0, FRAME, FRAME);
      } else {
        ctx.drawImage(img, frame * FRAME, row * FRAME, FRAME, FRAME, dx, dy, FRAME, FRAME);
      }
      ctx.restore();
    }
  }

  Dwarf.SHOCK_RX = SHOCK_RX;
  Dwarf.SHOCK_RY = SHOCK_RY;
  Dwarf.REACH = REACH;
  Dwarf.JUMP_V = JUMP_V;
  window.Dwarf = Dwarf;
})();
