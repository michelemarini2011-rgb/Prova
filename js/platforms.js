/* Piattaforme mobili e blocchi irti: gli elementi che si muovono nella mappa. */
(function () {
  "use strict";

  const TILE = window.Arena.TILE;
  const PLAT_H = 14;             // spessore visibile della piattaforma
  const GRAVITY = 1800;
  const FRICTION = 620;

  /**
   * Appoggia un corpo su una piattaforma mobile, se in questo passo ne ha
   * attraversato il piano dall'alto. Restituisce la piattaforma o null.
   */
  function landOn(body, prevBottom, movers) {
    if (!movers || body.vy < 0) return null;
    if (body.dropTimer > 0) return null;          // sta attraversando dall'alto
    for (const m of movers) {
      if (body.x + body.w <= m.x + 3 || body.x >= m.x + m.w - 3) continue;
      if (prevBottom > m.y + 8) continue;         // era già sotto il piano
      const bottom = body.y + body.h;
      if (bottom < m.y || bottom > m.y + 24) continue;
      body.y = m.y - body.h;
      body.vy = 0;
      return m;
    }
    return null;
  }

  /** Piattaforma che scorre finché non trova il bordo, un muro o un'altra. */
  class MovingPlatform {
    constructor(arena, tx, ty, tiles, speed) {
      this.arena = arena;
      this.x = tx * TILE;
      this.y = ty * TILE;
      this.w = tiles * TILE;
      this.h = PLAT_H;
      this.tiles = tiles;
      this.vx = speed;
      this.dx = 0;
    }

    /**
     * Scorre finché non trova qualcosa, e allora torna indietro: il bordo della
     * mappa, un muro alla propria quota o un'altra piattaforma.
     */
    update(dt, others) {
      const before = this.x;
      const dir = this.vx > 0 ? 1 : -1;
      let nx = this.x + this.vx * dt;
      let stop = null;                      // posizione a cui fermarsi, se c'è

      // bordi della mappa
      if (dir < 0 && nx < 0) stop = 0;
      else if (dir > 0 && nx + this.w > this.arena.w) stop = this.arena.w - this.w;

      // muro solido alla propria quota
      const ty = Math.floor((this.y + 4) / TILE);
      const lead = dir > 0 ? nx + this.w - 0.01 : nx;
      const tx = Math.floor(lead / TILE);
      if (this.arena.isSolid(tx, ty)) {
        const wall = dir > 0 ? tx * TILE - this.w : (tx + 1) * TILE;
        if (stop === null || Math.abs(wall - before) < Math.abs(stop - before)) stop = wall;
      }

      // un'altra piattaforma alla stessa altezza
      for (const o of others) {
        if (o === this || Math.abs(o.y - this.y) > TILE * 0.6) continue;
        if (nx + this.w <= o.x || nx >= o.x + o.w) continue;
        const side = dir > 0 ? o.x - this.w : o.x + o.w;
        if (stop === null || Math.abs(side - before) < Math.abs(stop - before)) stop = side;
      }

      if (stop !== null) {
        nx = stop;
        this.vx = -this.vx;
      }
      this.x = nx;
      this.dx = this.x - before;
    }

    draw(ctx) {
      const img = window.Assets.img.movplat;
      const x = Math.round(this.x), y = Math.round(this.y);
      ctx.drawImage(img, 0, 0, TILE, TILE, x, y, TILE, TILE);
      for (let i = 1; i < this.tiles - 1; i++) {
        ctx.drawImage(img, TILE, 0, TILE, TILE, x + i * TILE, y, TILE, TILE);
      }
      if (this.tiles > 1) {
        ctx.drawImage(img, 2 * TILE, 0, TILE, TILE, x + (this.tiles - 1) * TILE, y, TILE, TILE);
      }
    }
  }

  /**
   * Blocco irto di punte: si sposta solo a martellate — toccarlo è fatale —
   * e può finire su una piattaforma mobile e farsi trasportare.
   */
  class Block {
    constructor(arena, tx, ty) {
      this.arena = arena;
      this.w = 30;
      this.h = 30;
      this.homeX = tx * TILE + 1;
      this.homeY = ty * TILE + 2;
      this.reset();
    }

    reset() {
      this.x = this.homeX;
      this.y = this.homeY;
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.rider = null;
      this.spin = 0;
    }

    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }

    /** Spinta dell'onda d'urto: il blocco scivola via dal punto d'impatto. */
    push(fromX, power) {
      this.vx += (this.cx < fromX ? -1 : 1) * power;
      this.vx = Math.max(-320, Math.min(320, this.vx));
    }

    update(dt, blocks) {
      // trasportato dalla piattaforma su cui poggia (che si è già mossa)
      if (this.rider) { this.moveX(this.rider.dx, blocks); this.rider = null; }

      this.vy = Math.min(700, this.vy + GRAVITY * dt);
      if (this.onGround) {
        const fr = FRICTION * dt;
        this.vx = Math.abs(this.vx) <= fr ? 0 : this.vx - Math.sign(this.vx) * fr;
      }
      this.spin += this.vx * dt * 0.03;

      this.moveX(this.vx * dt, blocks);
      this.moveY(this.vy * dt, blocks);
    }

    moveX(dx, blocks) {
      if (!dx) return;
      this.x += dx;
      const t = this.tiles();
      for (let ty = t.y0; ty <= t.y1; ty++) {
        for (let tx = t.x0; tx <= t.x1; tx++) {
          if (!this.arena.isSolid(tx, ty)) continue;
          this.x = dx > 0 ? tx * TILE - this.w : (tx + 1) * TILE;
          this.vx = 0;
          return;
        }
      }
      for (const o of blocks) {
        if (o === this) continue;
        if (this.x + this.w <= o.x || this.x >= o.x + o.w) continue;
        if (this.y + this.h <= o.y || this.y >= o.y + o.h) continue;
        this.x = dx > 0 ? o.x - this.w : o.x + o.w;
        this.vx = 0;
        return;
      }
    }

    moveY(dy, blocks) {
      const prevBottom = this.y + this.h;
      this.y += dy;
      this.onGround = false;
      const t = this.tiles();
      for (let ty = t.y0; ty <= t.y1; ty++) {
        for (let tx = t.x0; tx <= t.x1; tx++) {
          const solid = this.arena.isSolid(tx, ty);
          const oneway = this.arena.isOneWay(tx, ty);
          if (!solid && !oneway) continue;
          if (oneway && (dy <= 0 || prevBottom > ty * TILE + 6)) continue;
          if (dy > 0) { this.y = ty * TILE - this.h; this.onGround = true; }
          else { this.y = (ty + 1) * TILE; }
          this.vy = 0;
          return;
        }
      }
      for (const o of blocks) {
        if (o === this) continue;
        if (this.x + this.w <= o.x || this.x >= o.x + o.w) continue;
        if (this.y + this.h <= o.y || this.y >= o.y + o.h) continue;
        if (dy > 0) { this.y = o.y - this.h; this.onGround = true; }
        else { this.y = o.y + o.h; }
        this.vy = 0;
        return;
      }
      const m = landOn(this, prevBottom, this.arena.movers);
      if (m) { this.onGround = true; this.rider = m; }
    }

    tiles() {
      return {
        x0: Math.floor(this.x / TILE), x1: Math.floor((this.x + this.w - 1) / TILE),
        y0: Math.floor(this.y / TILE), y1: Math.floor((this.y + this.h - 1) / TILE)
      };
    }

    /** Contatto con il nano: fatale. */
    touches(dwarf) {
      return !(dwarf.x + dwarf.w <= this.x + 3 || dwarf.x >= this.x + this.w - 3 ||
               dwarf.y + dwarf.h <= this.y + 3 || dwarf.y >= this.y + this.h - 3);
    }

    draw(ctx) {
      const img = window.Assets.img.hazard;
      const s = 40;
      ctx.save();
      ctx.translate(Math.round(this.cx), Math.round(this.cy));
      ctx.rotate(this.spin);            // rotola quando scivola: si vede che è vivo
      ctx.drawImage(img, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }

  window.Movers = { MovingPlatform, Block, landOn, PLAT_H };
})();
