/* La volpe: fisica del movimento, salto e collisioni con il mondo. */
(function () {
  "use strict";

  const TILE = window.World.TILE;
  const FRAME = 48;

  const GRAVITY = 2000;
  const MAX_FALL = 900;
  const RUN = 232;
  const ACCEL_GROUND = 2300;
  const ACCEL_AIR = 1500;
  const FRICTION_GROUND = 2600;
  const FRICTION_AIR = 700;
  const JUMP_V = 640;          // ~3,2 celle di altezza
  const CUT_V = 190;           // salto corto rilasciando il tasto
  const COYOTE = 0.10;         // salto concesso poco dopo il bordo
  const BUFFER = 0.13;         // salto memorizzato poco prima di atterrare
  const BOUNCE_V = 430;

  // righe di fox.png
  const ROW = { idle: 0, run: 1, jump: 2, fall: 3, hurt: 4 };
  const COUNT = { idle: 4, run: 6, jump: 1, fall: 1, hurt: 1 };

  class Player {
    constructor(world) {
      this.world = world;
      this.w = 24;
      this.h = 28;
      this.reset(world.start);
    }

    reset(pos) {
      this.x = pos.x - this.w / 2;
      this.y = pos.y - this.h;
      this.vx = 0;
      this.vy = 0;
      this.facing = 1;
      this.onGround = false;
      this.coyote = 0;
      this.buffer = 0;
      this.jumping = false;
      this.dropTimer = 0;
      this.invuln = 0;
      this.anim = 0;
      this.state = "idle";
      this.dead = false;
      this.landed = 0;
    }

    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }

    hurt(fromX) {
      if (this.invuln > 0 || this.dead) return false;
      this.invuln = 1.4;
      this.vy = -270;
      this.vx = (this.cx < fromX ? -1 : 1) * 230;
      return true;
    }

    bounce() {
      this.vy = -BOUNCE_V;
      this.jumping = true;
      this.buffer = 0;
    }

    update(dt, input, game) {
      const wasOnGround = this.onGround;

      if (this.invuln > 0) this.invuln -= dt;
      if (this.dropTimer > 0) this.dropTimer -= dt;

      const dir = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;
      if (dir !== 0) {
        this.vx += dir * accel * dt;
        this.vx = Math.max(-RUN, Math.min(RUN, this.vx));
        this.facing = dir;
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
          this.dropTimer = 0.22;          // scendere dalle assi di legno
          this.onGround = false;
        } else {
          this.vy = -JUMP_V;
          this.jumping = true;
          game.onJump(this);
        }
        this.buffer = 0;
        this.coyote = 0;
      }
      if (this.jumping && !input.jump && this.vy < -CUT_V) this.vy = -CUT_V;
      if (this.vy >= 0) this.jumping = false;

      this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);

      this.moveX(this.vx * dt);
      this.moveY(this.vy * dt);

      if (this.onGround) this.coyote = COYOTE;
      if (this.onGround && !wasOnGround) {
        this.landed = 0.12;
        game.onLand(this);
      }
      if (this.landed > 0) this.landed -= dt;

      // stato dell'animazione
      let state = "idle";
      if (this.invuln > 1.0) state = "hurt";
      else if (!this.onGround) state = this.vy < 0 ? "jump" : "fall";
      else if (Math.abs(this.vx) > 14) state = "run";
      if (state !== this.state) { this.state = state; this.anim = 0; }
      this.anim += dt * (state === "run" ? Math.abs(this.vx) / 26 : 5);
    }

    tilesOverlapped() {
      return {
        x0: Math.floor(this.x / TILE),
        x1: Math.floor((this.x + this.w - 1) / TILE),
        y0: Math.floor(this.y / TILE),
        y1: Math.floor((this.y + this.h - 1) / TILE)
      };
    }

    moveX(dx) {
      this.x += dx;
      const t = this.tilesOverlapped();
      for (let ty = t.y0; ty <= t.y1; ty++) {
        for (let tx = t.x0; tx <= t.x1; tx++) {
          if (!this.world.isSolid(tx, ty)) continue;
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
      const t = this.tilesOverlapped();
      for (let ty = t.y0; ty <= t.y1; ty++) {
        for (let tx = t.x0; tx <= t.x1; tx++) {
          const solid = this.world.isSolid(tx, ty);
          const oneway = this.world.isOneWay(tx, ty);
          if (!solid && !oneway) continue;
          if (oneway) {
            // si attraversa da sotto e mentre si sta scendendo apposta
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

    draw(ctx, time) {
      if (this.invuln > 0 && Math.floor(time * 18) % 2 === 0 && this.invuln < 1.2) return;
      const img = window.Assets.img.fox;
      const row = ROW[this.state];
      const frame = Math.floor(this.anim) % COUNT[this.state];
      const dx = Math.round(this.cx - FRAME / 2);
      const dy = Math.round(this.y + this.h - FRAME + 2);
      ctx.save();
      if (this.facing < 0) {
        ctx.translate(dx + FRAME, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(img, frame * FRAME, row * FRAME, FRAME, FRAME, 0, 0, FRAME, FRAME);
      } else {
        ctx.drawImage(img, frame * FRAME, row * FRAME, FRAME, FRAME, dx, dy, FRAME, FRAME);
      }
      ctx.restore();
    }

    /** Posizione della punta della coda: è la lanterna della volpe. */
    lightPos() {
      return { x: this.cx - this.facing * 13, y: this.y + 4 };
    }
  }

  Player.JUMP_V = JUMP_V;
  Player.RUN = RUN;
  Player.GRAVITY = GRAVITY;
  window.Player = Player;
})();
