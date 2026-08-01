/* Griglia del labirinto: muri, pallini, tunnel e disegno dello sfondo. */
(function () {
  "use strict";

  const M = window.MAZE;
  const TILE = M.TILE;

  const EMPTY = 0;
  const PELLET = 1;
  const POWER = 2;

  class Level {
    constructor() {
      this.cols = M.COLS;
      this.rows = M.ROWS;
      this.grid = M.LAYOUT.map((row) => row.padEnd(M.COLS, " ").split(""));
      this.reset();
    }

    /** Ripopola tutti i pallini. */
    reset() {
      this.dots = [];
      this.totalDots = 0;
      for (let y = 0; y < this.rows; y++) {
        const line = [];
        for (let x = 0; x < this.cols; x++) {
          const ch = this.grid[y][x];
          if (ch === ".") { line.push(PELLET); this.totalDots++; }
          else if (ch === "o") { line.push(POWER); this.totalDots++; }
          else line.push(EMPTY);
        }
        this.dots.push(line);
      }
      this.dotsLeft = this.totalDots;
      this.dotsEaten = 0;
    }

    charAt(tx, ty) {
      if (ty < 0 || ty >= this.rows) return "#";
      if (tx < 0 || tx >= this.cols) return ty === Level.TUNNEL_ROW ? " " : "#";
      return this.grid[ty][tx];
    }

    /**
     * `gate` a true consente di attraversare il cancello della casa dei fantasmi.
     */
    isWalkable(tx, ty, gate) {
      const ch = this.charAt(tx, ty);
      if (ch === "#") return false;
      if (ch === "-") return !!gate;
      return true;
    }

    isTunnel(tx, ty) {
      return ty === Level.TUNNEL_ROW && (tx <= 5 || tx >= this.cols - 6);
    }

    dotAt(tx, ty) {
      if (ty < 0 || ty >= this.rows || tx < 0 || tx >= this.cols) return EMPTY;
      return this.dots[ty][tx];
    }

    eatDot(tx, ty) {
      const d = this.dotAt(tx, ty);
      if (d === EMPTY) return EMPTY;
      this.dots[ty][tx] = EMPTY;
      this.dotsLeft--;
      this.dotsEaten++;
      return d;
    }

    /** Sfondo del labirinto (o versione lampeggiante bianca). */
    drawMaze(ctx, flash) {
      const img = flash ? window.Assets.img.mazeFlash : window.Assets.img.maze;
      ctx.drawImage(img, -M.PAD, -M.PAD);
    }

    drawDots(ctx, powerPhase) {
      const small = window.Assets.img.pellet;
      const big = window.Assets.img.powerPellet;
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          const d = this.dots[y][x];
          if (d === EMPTY) continue;
          if (d === PELLET) {
            ctx.drawImage(small, x * TILE, y * TILE);
          } else {
            const pulse = 0.5 + 0.5 * Math.sin(powerPhase * Math.PI * 2.6);
            const k = 0.88 + 0.22 * pulse;
            ctx.save();
            ctx.globalAlpha = 0.72 + 0.28 * pulse;
            ctx.translate((x + 0.5) * TILE, (y + 0.5) * TILE);
            ctx.scale(k, k);
            ctx.drawImage(big, -TILE / 2, -TILE / 2);
            ctx.restore();
          }
        }
      }
    }
  }

  Level.TUNNEL_ROW = 14;
  Level.EMPTY = EMPTY;
  Level.PELLET = PELLET;
  Level.POWER = POWER;

  window.Level = Level;
})();
