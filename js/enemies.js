/* Abitanti del bosco: coleotteri che camminano, fuochi fatui che fluttuano. */
(function () {
  "use strict";

  const TILE = window.World.TILE;
  const FRAME = 48;

  class Beetle {
    constructor(world, x, y) {
      this.world = world;
      this.w = 30;
      this.h = 20;
      this.x = x - this.w / 2;
      this.y = y - this.h;
      this.vx = -52;
      this.anim = Math.random() * 4;
      this.dead = false;
      this.deadTimer = 0;
      this.stompable = true;
    }

    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }

    update(dt) {
      if (this.dead) { this.deadTimer += dt; return; }
      this.anim += dt * 7;
      this.x += this.vx * dt;

      // cade se manca il terreno, e torna indietro davanti a un muro o a un bordo
      const footY = Math.floor((this.y + this.h + 2) / TILE);
      const aheadX = Math.floor((this.vx < 0 ? this.x - 2 : this.x + this.w + 2) / TILE);
      const midY = Math.floor(this.cy / TILE);
      const groundAhead = this.world.isSolid(aheadX, footY) || this.world.isOneWay(aheadX, footY);
      const wallAhead = this.world.isSolid(aheadX, midY);
      if (!groundAhead || wallAhead) {
        this.vx = -this.vx;
        this.x += this.vx * dt * 2;
      }
    }

    stomp() {
      this.dead = true;
      this.deadTimer = 0;
      this.vx = 0;
    }

    draw(ctx) {
      const img = window.Assets.img.enemies;
      const frame = this.dead ? 0 : Math.floor(this.anim) % 4;
      const dx = Math.round(this.cx - FRAME / 2);
      const dy = Math.round(this.y + this.h - 40);
      ctx.save();
      if (this.dead) {
        ctx.globalAlpha = Math.max(0, 1 - this.deadTimer * 1.6);
        ctx.translate(dx + FRAME / 2, dy + FRAME / 2 + this.deadTimer * 12);
        ctx.scale(1, Math.max(0.25, 1 - this.deadTimer * 2));
        ctx.translate(-FRAME / 2, -FRAME / 2);
        ctx.drawImage(img, 0, 0, FRAME, FRAME, 0, 0, FRAME, FRAME);
      } else if (this.vx > 0) {
        ctx.translate(dx + FRAME, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(img, frame * FRAME, 0, FRAME, FRAME, 0, 0, FRAME, FRAME);
      } else {
        ctx.drawImage(img, frame * FRAME, 0, FRAME, FRAME, dx, dy, FRAME, FRAME);
      }
      ctx.restore();
    }

    lights(out) {
      if (!this.dead) out.push({ x: this.cx, y: this.cy, r: 54, warm: 0.0 });
    }
  }

  class Wisp {
    constructor(world, x, y) {
      this.world = world;
      this.w = 22;
      this.h = 22;
      this.homeX = x;
      this.homeY = y;
      this.t = Math.random() * Math.PI * 2;
      this.range = 78;
      this.anim = Math.random() * 4;
      this.dead = false;
      this.stompable = false;
      this.x = x - this.w / 2;
      this.y = y - this.h / 2;
    }

    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }

    update(dt) {
      this.t += dt * 1.15;
      this.anim += dt * 6;
      this.x = this.homeX - this.w / 2 + Math.sin(this.t) * this.range;
      this.y = this.homeY - this.h / 2 + Math.sin(this.t * 1.7) * 22;
    }

    draw(ctx) {
      const img = window.Assets.img.enemies;
      const frame = Math.floor(this.anim) % 4;
      ctx.drawImage(img, frame * FRAME, FRAME, FRAME, FRAME,
        Math.round(this.cx - FRAME / 2), Math.round(this.cy - FRAME / 2 + 6), FRAME, FRAME);
    }

    lights(out) {
      out.push({ x: this.cx, y: this.cy, r: 96, warm: 0.0 });
    }
  }

  window.Enemies = { Beetle, Wisp };
})();
