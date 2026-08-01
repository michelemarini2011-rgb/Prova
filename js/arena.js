/* L'arena: griglia a schermo fisso, collisioni, macchinario e disegno. */
(function () {
  "use strict";

  const TILE = 32;
  const COLS = 30;
  const ROWS = 16;
  const MACHINE = 128;          // il macchinario occupa 4x4 celle

  const WALL = "#";
  const ROCK = "R";
  const RUBBLE = ",";
  const TORCH = "T";

  class Arena {
    constructor(data) {
      this.name = data.name;
      this.hint = data.hint;
      this.stun = data.stun;
      this.impSpeed = data.speed;
      this.rows = data.rows;
      this.w = COLS * TILE;
      this.h = ROWS * TILE;

      this.start = { x: TILE * 2, y: TILE * 2 };
      this.spawns = [];
      this.torches = [];
      this.rubble = [];
      this.machine = null;
      this.portalSpot = { x: this.w / 2, y: this.h / 2 };
      this.scan();
      this.bake();
    }

    at(tx, ty) {
      if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return WALL;
      return this.rows[ty][tx];
    }

    isSolid(tx, ty) {
      const c = this.at(tx, ty);
      return c === WALL || c === ROCK || c === TORCH || c === "M";
    }

    scan() {
      for (let ty = 0; ty < ROWS; ty++) {
        for (let tx = 0; tx < COLS; tx++) {
          const c = this.at(tx, ty);
          const x = tx * TILE + TILE / 2;
          const y = ty * TILE + TILE / 2;
          if (c === "P") this.start = { x, y };
          else if (c === "S") this.spawns.push({ x, y });
          else if (c === "O") this.portalSpot = { x, y };
          else if (c === TORCH) this.torches.push({ x, y, phase: Math.random() * 6.28 });
          else if (c === RUBBLE) this.rubble.push({ x, y });
          else if (c === "M") {
            this.machine = {
              x: tx * TILE,
              y: ty * TILE,
              w: MACHINE,
              h: MACHINE,
              // l'imbuto sta sul fianco sinistro: è lì che si consegna
              intake: { x: tx * TILE + 12, y: ty * TILE + 68, r: 34 },
              anim: 0,
              crates: 0
            };
          }
        }
      }
    }

    /** Il pavimento e le rocce non cambiano mai: si disegnano una volta sola. */
    bake() {
      const cv = document.createElement("canvas");
      cv.width = this.w;
      cv.height = this.h;
      const ctx = cv.getContext("2d");
      const tiles = window.Assets.img.tiles;

      for (let ty = 0; ty < ROWS; ty++) {
        for (let tx = 0; tx < COLS; tx++) {
          const x = tx * TILE, y = ty * TILE;
          const c = this.at(tx, ty);
          // sotto a tutto c'è sempre il pavimento
          const v = (tx * 5 + ty * 11) % 4;
          ctx.drawImage(tiles, v * TILE, 2 * TILE, TILE, TILE, x, y, TILE, TILE);
          if (this.underMachine(tx, ty)) continue;   // ci pensa il disegno del macchinario
          if (c === WALL || c === TORCH || c === "M") {
            const m = (this.isWallLike(tx, ty - 1) ? 1 : 0)
              | (this.isWallLike(tx + 1, ty) ? 2 : 0)
              | (this.isWallLike(tx, ty + 1) ? 4 : 0)
              | (this.isWallLike(tx - 1, ty) ? 8 : 0);
            ctx.drawImage(tiles, (m % 8) * TILE, Math.floor(m / 8) * TILE, TILE, TILE, x, y, TILE, TILE);
          } else if (c === ROCK) {
            ctx.drawImage(tiles, 4 * TILE, 2 * TILE, TILE, TILE, x, y, TILE, TILE);
          } else if (c === RUBBLE) {
            ctx.drawImage(tiles, 5 * TILE, 2 * TILE, TILE, TILE, x, y, TILE, TILE);
          }
        }
      }
      this.baked = cv;
    }

    /** Le celle occupate dal macchinario restano solide ma non si disegnano. */
    underMachine(tx, ty) {
      const m = this.machine;
      if (!m) return false;
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
      return x > m.x && x < m.x + m.w && y > m.y && y < m.y + m.h;
    }

    isWallLike(tx, ty) {
      const c = this.at(tx, ty);
      return c === WALL || c === TORCH || c === "M";
    }

    /** Sposta un corpo circolare risolvendo gli assi separatamente. */
    move(body, dx, dy) {
      body.x += dx;
      this.resolve(body, dx, 0);
      body.y += dy;
      this.resolve(body, 0, dy);
    }

    resolve(body, dx, dy) {
      const r = body.r;
      const x0 = Math.floor((body.x - r) / TILE), x1 = Math.floor((body.x + r) / TILE);
      const y0 = Math.floor((body.y - r) / TILE), y1 = Math.floor((body.y + r) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (!this.isSolid(tx, ty)) continue;
          const left = tx * TILE, top = ty * TILE;
          if (body.x + r <= left || body.x - r >= left + TILE) continue;
          if (body.y + r <= top || body.y - r >= top + TILE) continue;
          if (dx > 0) body.x = left - r;
          else if (dx < 0) body.x = left + TILE + r;
          if (dy > 0) body.y = top - r;
          else if (dy < 0) body.y = top + TILE + r;
          if (dx) body.vx = -(body.vx || 0) * (body.bounce || 0);
          if (dy) body.vy = -(body.vy || 0) * (body.bounce || 0);
        }
      }
    }

    drawFloor(ctx) {
      ctx.drawImage(this.baked, 0, 0);
    }

    drawMachine(ctx, time) {
      const m = this.machine;
      if (!m) return;
      const img = window.Assets.img.machine;
      const frame = m.anim > 0 ? 1 + (Math.floor(time * 12) % 2) : 0;
      ctx.drawImage(img, frame * MACHINE, 0, MACHINE, MACHINE, m.x, m.y, MACHINE, MACHINE);

      // le casse prodotte si accatastano accanto allo scivolo
      const crate = window.Assets.img.crate;
      for (let i = 0; i < m.crates; i++) {
        const col = i % 3, row = Math.floor(i / 3);
        ctx.drawImage(crate, m.x + 96 - col * 22, m.y + 128 - 18 - row * 16, 26, 26);
      }
    }

    lights(out) {
      for (const t of this.torches) out.push({ x: t.x, y: t.y, r: 150, warm: 1 });
      if (this.machine) {
        const m = this.machine;
        out.push({ x: m.x + 66, y: m.y + 74, r: m.anim > 0 ? 150 : 96, warm: 0.2 });
      }
      return out;
    }

    drawTorches(ctx, time) {
      const icons = window.Assets.img.icons;
      for (const t of this.torches) {
        const k = 1 + Math.sin(time * 9 + t.phase) * 0.07;
        ctx.save();
        ctx.translate(t.x, t.y + 2);
        ctx.scale(k, k);
        ctx.drawImage(icons, 3 * 32, 0, 32, 32, -16, -16, 32, 32);
        ctx.restore();
      }
    }
  }

  Arena.TILE = TILE;
  Arena.COLS = COLS;
  Arena.ROWS = ROWS;
  window.Arena = Arena;
})();
