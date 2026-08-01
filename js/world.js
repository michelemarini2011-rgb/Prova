/* Il mondo: griglia del livello, collisioni e disegno dello scenario. */
(function () {
  "use strict";

  const TILE = 32;
  const FRAME = 48;

  // indici dei fotogrammi in props.png
  const PROP = {
    mushroomSmall: 0, mushroomBig: 1, fern: 2, tuft: 3, rock: 4,
    lanternOff: 5, lanternOn: 6, firefly: 7, acorn: 8
  };
  const DECOR = { m: PROP.mushroomSmall, M: PROP.mushroomBig, f: PROP.fern, t: PROP.tuft, r: PROP.rock };

  const SOLID = "#";
  const ONEWAY = "=";
  const THORN = "^";

  class World {
    constructor(data) {
      this.name = data.name;
      this.hint = data.hint;
      this.rows = data.rows;
      this.h = this.rows.length;
      this.w = this.rows[0].length;
      this.pixelW = this.w * TILE;
      this.pixelH = this.h * TILE;

      this.start = { x: TILE, y: 0 };
      this.door = null;
      this.lanterns = [];
      this.fireflies = [];
      this.spawns = [];
      this.decor = [];
      this.scan();
      this.bake();
    }

    at(tx, ty) {
      if (ty < 0 || ty >= this.h) return " ";
      if (tx < 0 || tx >= this.w) return " ";
      return this.rows[ty][tx];
    }

    isSolid(tx, ty) {
      // fuori dai bordi laterali il mondo è chiuso, sotto è vuoto (si cade)
      if (tx < 0 || tx >= this.w) return true;
      if (ty < 0) return false;
      if (ty >= this.h) return false;
      return this.rows[ty][tx] === SOLID;
    }

    isOneWay(tx, ty) { return this.at(tx, ty) === ONEWAY; }
    isThorn(tx, ty) { return this.at(tx, ty) === THORN; }

    scan() {
      for (let ty = 0; ty < this.h; ty++) {
        for (let tx = 0; tx < this.w; tx++) {
          const ch = this.at(tx, ty);
          const cx = tx * TILE + TILE / 2;
          const cy = ty * TILE + TILE / 2;
          if (ch === "P") {
            this.start = { x: cx, y: ty * TILE + TILE };
          } else if (ch === "D") {
            this.door = { x: cx, y: ty * TILE + TILE, open: false };
          } else if (ch === "L") {
            this.lanterns.push({ x: cx, y: cy, lit: false });
          } else if (ch === "o") {
            this.fireflies.push({ x: cx, y: cy, taken: false, phase: Math.random() * Math.PI * 2 });
          } else if (ch === "b") {
            // i coleotteri poggiano sul fondo della cella
            this.spawns.push({ type: "beetle", x: cx, y: ty * TILE + TILE });
          } else if (ch === "w") {
            this.spawns.push({ type: "wisp", x: cx, y: cy });
          } else if (DECOR[ch] !== undefined) {
            this.decor.push({ frame: DECOR[ch], x: cx, y: ty * TILE + TILE });
          }
        }
      }
      this.totalFireflies = this.fireflies.length;
    }

    /** Maschera per l'autotile: 1 sopra, 2 destra, 4 sotto, 8 sinistra. */
    mask(tx, ty) {
      return (this.isSolid(tx, ty - 1) ? 1 : 0)
        | (this.isSolid(tx + 1, ty) ? 2 : 0)
        | (this.isSolid(tx, ty + 1) ? 4 : 0)
        | (this.isSolid(tx - 1, ty) ? 8 : 0);
    }

    /** Disegna una volta sola terreno, assi, rovi e decorazioni. */
    bake() {
      const cv = document.createElement("canvas");
      cv.width = this.pixelW;
      cv.height = this.pixelH;
      const ctx = cv.getContext("2d");
      const tiles = window.Assets.img.tiles;
      const props = window.Assets.img.props;

      for (let ty = 0; ty < this.h; ty++) {
        for (let tx = 0; tx < this.w; tx++) {
          const ch = this.at(tx, ty);
          const x = tx * TILE, y = ty * TILE;
          if (ch === SOLID) {
            const m = this.mask(tx, ty);
            // due varianti alternate: il terreno lungo non sembra ripetuto
            const v = (tx * 7 + ty * 13) % 2;
            const sy = (Math.floor(m / 8) + v * 2) * TILE;
            ctx.drawImage(tiles, (m % 8) * TILE, sy, TILE, TILE, x, y, TILE, TILE);
          } else if (ch === ONEWAY) {
            ctx.drawImage(tiles, 0, 4 * TILE, TILE, TILE, x, y, TILE, TILE);
          } else if (ch === THORN) {
            ctx.drawImage(tiles, TILE, 4 * TILE, TILE, TILE, x, y, TILE, TILE);
          }
        }
      }
      for (const d of this.decor) {
        ctx.drawImage(props, d.frame * FRAME, 0, FRAME, FRAME, d.x - FRAME / 2, d.y - FRAME, FRAME, FRAME);
      }
      this.baked = cv;
    }

    drawStatic(ctx, cam) {
      ctx.drawImage(this.baked, -cam.x, -cam.y);
    }

    drawDoor(ctx, time) {
      if (!this.door) return;
      const img = window.Assets.img.door;
      const w = 96, h = 128;
      const frame = this.door.open ? 1 : 0;
      ctx.drawImage(img, frame * w, 0, w, h, this.door.x - w / 2, this.door.y - h, w, h);
    }

    drawPickups(ctx, time) {
      const props = window.Assets.img.props;
      for (const l of this.lanterns) {
        const f = l.lit ? PROP.lanternOn : PROP.lanternOff;
        ctx.drawImage(props, f * FRAME, 0, FRAME, FRAME, l.x - FRAME / 2, l.y - FRAME / 2 - 4, FRAME, FRAME);
      }
      for (const f of this.fireflies) {
        if (f.taken) continue;
        const bob = Math.sin(time * 2.4 + f.phase) * 3;
        ctx.save();
        ctx.globalAlpha = 0.82 + 0.18 * Math.sin(time * 4 + f.phase);
        ctx.drawImage(props, PROP.firefly * FRAME, 0, FRAME, FRAME,
          f.x - FRAME / 2, f.y - FRAME / 2 + bob, FRAME, FRAME);
        ctx.restore();
      }
    }

    /** Sorgenti luminose per lo strato di buio. */
    lights(out) {
      for (const l of this.lanterns) if (l.lit) out.push({ x: l.x, y: l.y, r: 210, warm: 0.55 });
      for (const f of this.fireflies) if (!f.taken) out.push({ x: f.x, y: f.y, r: 74, warm: 0.35 });
      if (this.door) out.push({ x: this.door.x, y: this.door.y - 46, r: this.door.open ? 190 : 96, warm: 0.5 });
      return out;
    }
  }

  World.TILE = TILE;
  World.PROP = PROP;
  window.World = World;
})();
