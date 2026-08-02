/* L'arena: schermo fisso in vista laterale, collisioni, macchinario, disegno. */
(function () {
  "use strict";

  const TILE = 32;
  const COLS = 30;
  const SCREEN_ROWS = 16;       // altezza di uno schermo; la mappa ne è alta N
  const MACHINE = 128;          // il macchinario occupa 4x4 celle

  const SOLID = "#";
  const ONEWAY = "=";
  const DECOR = { b: 1, r: 2, f: 3 };   // colonne nella riga 4 di tiles.png

  class Arena {
    constructor(data) {
      this.name = data.name;
      this.hint = data.hint;
      this.stun = data.stun;
      this.impSpeed = data.speed;
      this.rows = data.rows;
      this.nrows = data.rows.length;
      this.screens = Math.round(this.nrows / SCREEN_ROWS);
      this.w = COLS * TILE;
      this.h = this.nrows * TILE;

      this.start = { x: TILE * 2, y: TILE * 12 };
      this.spawns = [];
      this.machine = null;
      this.portalSpot = { x: this.w / 2, y: TILE * 13 };
      this.scan();
      this.bake();
    }

    at(tx, ty) {
      if (tx < 0 || tx >= COLS) return SOLID;      // i lati chiudono la mappa
      if (ty < 0 || ty >= this.nrows) return ".";
      return this.rows[ty][tx];
    }

    isSolid(tx, ty) {
      const c = this.at(tx, ty);
      return c === SOLID || c === "M";
    }

    isOneWay(tx, ty) { return this.at(tx, ty) === ONEWAY; }

    /** Quota della prima superficie sotto il punto dato (y in pixel). */
    surfaceUnder(x, y) {
      const tx = Math.floor(x / TILE);
      let ty = Math.max(0, Math.floor(y / TILE));
      for (; ty < this.nrows; ty++) {
        if (this.isSolid(tx, ty) || this.isOneWay(tx, ty)) return ty * TILE;
      }
      return this.h;
    }

    scan() {
      for (let ty = 0; ty < this.nrows; ty++) {
        for (let tx = 0; tx < COLS; tx++) {
          const c = this.at(tx, ty);
          const cx = tx * TILE + TILE / 2;
          if (c === "P") this.start = { x: cx, y: (ty + 1) * TILE };
          else if (c === "S") this.spawns.push({ x: cx, y: ty * TILE + TILE / 2 });
          else if (c === "O") this.portalSpot = { x: cx, y: (ty + 1) * TILE };
          else if (c === "M") {
            this.machine = {
              x: tx * TILE, y: ty * TILE, w: MACHINE, h: MACHINE,
              // l'imbuto è in basso a sinistra, all'altezza del terreno
              intake: { x: tx * TILE + 16, y: ty * TILE + 94, r: 42 },
              anim: 0, crates: 0
            };
          }
        }
      }
    }

    /** Terreno, assi e decorazioni non cambiano: si disegnano una volta sola. */
    bake() {
      const cv = document.createElement("canvas");
      cv.width = this.w;
      cv.height = this.h;
      const ctx = cv.getContext("2d");
      const tiles = window.Assets.img.tiles;

      for (let ty = 0; ty < this.nrows; ty++) {
        for (let tx = 0; tx < COLS; tx++) {
          const c = this.at(tx, ty);
          const x = tx * TILE, y = ty * TILE;
          if (this.underMachine(tx, ty)) continue;
          if (c === SOLID || c === "M") {
            const m = (this.isSolid(tx, ty - 1) ? 1 : 0)
              | (this.isSolid(tx + 1, ty) ? 2 : 0)
              | (this.isSolid(tx, ty + 1) ? 4 : 0)
              | (this.isSolid(tx - 1, ty) ? 8 : 0);
            const v = (tx * 5 + ty * 11) % 2;
            ctx.drawImage(tiles, (m % 8) * TILE, (Math.floor(m / 8) + v * 2) * TILE,
              TILE, TILE, x, y, TILE, TILE);
          } else if (c === ONEWAY) {
            ctx.drawImage(tiles, 0, 4 * TILE, TILE, TILE, x, y, TILE, TILE);
          } else if (DECOR[c] !== undefined) {
            ctx.drawImage(tiles, DECOR[c] * TILE, 4 * TILE, TILE, TILE, x, y, TILE, TILE);
          }
        }
      }
      this.baked = cv;
    }

    /** Le celle del macchinario restano solide ma le disegna il suo sprite. */
    underMachine(tx, ty) {
      const m = this.machine;
      if (!m) return false;
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
      return x > m.x && x < m.x + m.w && y > m.y && y < m.y + m.h;
    }

    /** Il terreno, già disegnato una volta sola: il chiamante ha già traslato. */
    drawMap(ctx) {
      ctx.drawImage(this.baked, 0, 0);
    }

    drawMachine(ctx, time) {
      const m = this.machine;
      if (!m) return;
      const img = window.Assets.img.machine;
      const frame = m.anim > 0 ? 1 + (Math.floor(time * 12) % 2) : 0;
      ctx.drawImage(img, frame * MACHINE, 0, MACHINE, MACHINE, m.x, m.y, MACHINE, MACHINE);

      const crate = window.Assets.img.crate;
      for (let i = 0; i < m.crates; i++) {
        const col = i % 3, row = Math.floor(i / 3);
        ctx.drawImage(crate, m.x + 92 - col * 24, m.y + 128 - 26 - row * 22, 26, 26);
      }
    }
  }

  Arena.TILE = TILE;
  Arena.COLS = COLS;
  Arena.SCREEN_ROWS = SCREEN_ROWS;
  window.Arena = Arena;
})();
