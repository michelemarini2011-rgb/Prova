/* Pac-Man e i quattro fantasmi: movimento sulla griglia e intelligenza artificiale. */
(function () {
  "use strict";

  const M = window.MAZE;
  const T = M.TILE;
  const SPRITE = M.SPRITE;

  // 0 destra, 1 giù, 2 sinistra, 3 su (stesso ordine dello sprite sheet)
  const DIRS = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 }
  ];
  const RIGHT = 0, DOWN = 1, LEFT = 2, UP = 3;

  // Caselle in cui i fantasmi non possono svoltare verso l'alto (regola originale).
  const NO_UP = ["12,11", "15,11", "12,23", "15,23"];

  const HOUSE_X = 14 * T;          // asse verticale della casa dei fantasmi
  const HOUSE_Y = 14.5 * T;        // riga centrale della casa
  const GATE_Y = 11.5 * T;         // corridoio appena sopra il cancello

  function opposite(dir) { return (dir + 2) % 4; }

  class Actor {
    constructor(level, x, y, dir) {
      this.level = level;
      this.startX = x;
      this.startY = y;
      this.startDir = dir;
      this.resetBase();
    }

    /** Non sovrascrivere: viene invocato dal costruttore. */
    resetBase() {
      this.x = this.startX;
      this.y = this.startY;
      this.dir = this.startDir;
      this.next = this.startDir;
      this.anim = 0;
      this.stopped = false;
    }

    reset() { this.resetBase(); }

    get tx() { return Math.floor(this.x / T); }
    get ty() { return Math.floor(this.y / T); }

    wrap() {
      const w = this.level.cols * T;
      if (this.x < -T / 2) this.x += w;
      else if (this.x > w + T / 2) this.x -= w;
    }

    distanceTo(other) {
      return Math.hypot(this.x - other.x, this.y - other.y);
    }
  }

  // ------------------------------------------------------------------ Pac-Man
  class Pacman extends Actor {
    constructor(level) {
      super(level, 14 * T, 23.5 * T, LEFT);
      this.reset();
    }

    reset() {
      this.resetBase();
      this.dying = false;
      this.deathFrame = 0;
    }

    setDirection(dir) { this.next = dir; }

    update(dt, speed) {
      if (this.dying) return;
      this.stopped = true;
      let dist = speed * dt;
      while (dist > 1e-6) {
        const step = Math.min(dist, 2);
        dist -= step;
        this.tryTurn();
        const d = DIRS[this.dir];
        const tx = this.tx, ty = this.ty;
        const cx = (tx + 0.5) * T, cy = (ty + 0.5) * T;
        const nx = this.x + d.x * step, ny = this.y + d.y * step;
        // fermati al centro della casella se la successiva è un muro
        if (d.x > 0 && nx > cx && !this.level.isWalkable(tx + 1, ty, false)) { this.x = cx; break; }
        if (d.x < 0 && nx < cx && !this.level.isWalkable(tx - 1, ty, false)) { this.x = cx; break; }
        if (d.y > 0 && ny > cy && !this.level.isWalkable(tx, ty + 1, false)) { this.y = cy; break; }
        if (d.y < 0 && ny < cy && !this.level.isWalkable(tx, ty - 1, false)) { this.y = cy; break; }
        this.x = nx;
        this.y = ny;
        this.stopped = false;
        this.wrap();
      }
      if (!this.stopped) this.anim += dt * 11;
    }

    tryTurn() {
      if (this.next === this.dir) return;
      const d = DIRS[this.next];
      const tx = this.tx, ty = this.ty;
      if (!this.level.isWalkable(tx + d.x, ty + d.y, false)) return;
      if (this.next === opposite(this.dir)) { this.dir = this.next; return; }
      const cx = (tx + 0.5) * T, cy = (ty + 0.5) * T;
      const tol = 3;
      if (d.x !== 0) {
        if (Math.abs(this.y - cy) <= tol) { this.y = cy; this.dir = this.next; }
      } else if (Math.abs(this.x - cx) <= tol) {
        this.x = cx;
        this.dir = this.next;
      }
    }

    draw(ctx) {
      const img = window.Assets.img;
      if (this.dying) {
        const f = Math.min(11, Math.floor(this.deathFrame));
        ctx.drawImage(img.pacmanDeath, f * SPRITE, 0, SPRITE, SPRITE,
          this.x - SPRITE / 2, this.y - SPRITE / 2, SPRITE, SPRITE);
        return;
      }
      const cycle = [1, 2, 1, 0];
      const frame = this.stopped ? 1 : cycle[Math.floor(this.anim) % 4];
      ctx.drawImage(img.pacman, frame * SPRITE, this.dir * SPRITE, SPRITE, SPRITE,
        this.x - SPRITE / 2, this.y - SPRITE / 2, SPRITE, SPRITE);
    }
  }

  // ------------------------------------------------------------------ Fantasmi
  // stati: "house" | "leaving" | "scatter" | "chase" | "frightened" | "eaten" | "entering"
  class Ghost extends Actor {
    constructor(level, index, name, home, scatter, startDir, startState) {
      super(level, home.x, home.y, startDir);
      this.index = index;
      this.name = name;
      this.homeX = home.x;
      this.homeY = home.y;
      this.scatterTile = scatter;
      this.startState = startState;
      this.reset();
    }

    reset() {
      this.resetBase();
      this.state = this.startState;
      this.target = { x: this.scatterTile.x, y: this.scatterTile.y };
      this.path = [];
      this.bob = 0;
      this.houseTimer = 0;
      this.frightTimer = 0;
      this.elroy = 0;
      this.released = this.startState !== "house";
      this.reverseQueued = false;
    }

    get frightened() { return this.state === "frightened"; }
    get eaten() { return this.state === "eaten" || this.state === "entering"; }
    get inHouse() { return this.state === "house" || this.state === "leaving"; }

    /** Cambio di fase dispersione/inseguimento: inversione immediata. */
    queueReverse() {
      if (this.state === "scatter" || this.state === "chase") this.reverseQueued = true;
    }

    setMode(mode) {
      if (this.state === "scatter" || this.state === "chase") this.state = mode;
    }

    frighten(seconds) {
      if (this.eaten) return false;
      if (this.state === "scatter" || this.state === "chase") {
        this.state = "frightened";
        this.reverseQueued = true;
      } else if (this.state === "frightened") {
        this.state = "frightened";
      } else {
        return false;   // in casa: resta in casa ma sarà comunque commestibile
      }
      this.frightTimer = seconds;
      return true;
    }

    speedFactor(p, mode) {
      if (this.eaten) return p.eatenSpeed;
      if (this.state === "frightened") return p.ghostFrightSpeed;
      if (this.level.isTunnel(this.tx, this.ty)) return p.tunnelSpeed;
      let s = p.ghostSpeed;
      if (this.elroy === 1) s += 0.05;
      else if (this.elroy === 2) s += 0.1;
      return s;
    }

    update(dt, game) {
      const p = game.params;
      const speed = this.speedFactor(p) * window.CFG.BASE_SPEED * T;
      this.anim += dt * 9;

      switch (this.state) {
        case "house":
          this.updateHouse(dt, game);
          return;
        case "leaving":
          this.updatePath(dt, speed, () => {
            this.dir = LEFT;
            this.state = game.chaseMode ? "chase" : "scatter";
            if (game.frightTimer > 0) { this.state = "frightened"; this.frightTimer = game.frightTimer; }
          });
          return;
        case "entering":
          this.updatePath(dt, speed, () => {
            this.state = "house";
            this.houseTimer = 0.4;
            this.dir = UP;
          });
          return;
        default:
          break;
      }

      if (this.state === "frightened") {
        this.frightTimer -= dt;
        if (this.frightTimer <= 0) this.state = game.chaseMode ? "chase" : "scatter";
      }

      if (this.reverseQueued) {
        this.reverseQueued = false;
        this.dir = opposite(this.dir);
      }

      this.updateTarget(game);
      this.moveOnGrid(speed * dt, game);
    }

    /** Posto in cui il fantasma sosta dentro la casa (Blinky parte fuori). */
    get parkY() { return Math.max(this.homeY, HOUSE_Y); }

    updateHouse(dt, game) {
      // ondeggia in verticale finché non è il momento di uscire
      this.bob += dt * 3;
      this.x = this.homeX;
      this.y = this.parkY + Math.sin(this.bob) * 6;
      this.dir = Math.cos(this.bob) > 0 ? DOWN : UP;
      this.houseTimer -= dt;
      if (this.houseTimer <= 0 && game.canLeaveHouse(this)) this.startLeaving();
    }

    startLeaving() {
      this.state = "leaving";
      this.released = true;
      this.path = [{ x: HOUSE_X, y: this.y }, { x: HOUSE_X, y: GATE_Y }];
    }

    /** Movimento libero (dentro/fuori dalla casa) lungo una lista di waypoint. */
    updatePath(dt, speed, onDone) {
      let dist = speed * dt;
      while (dist > 1e-6 && this.path.length) {
        const wp = this.path[0];
        const dx = wp.x - this.x, dy = wp.y - this.y;
        const len = Math.hypot(dx, dy);
        if (len <= dist) {
          this.x = wp.x; this.y = wp.y;
          dist -= len;
          this.path.shift();
        } else {
          this.x += (dx / len) * dist;
          this.y += (dy / len) * dist;
          if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? RIGHT : LEFT;
          else this.dir = dy > 0 ? DOWN : UP;
          dist = 0;
        }
      }
      if (!this.path.length) onDone();
    }

    updateTarget(game) {
      const pac = game.pacman;
      const pt = { x: pac.tx, y: pac.ty };
      const pd = DIRS[pac.dir];

      if (this.state === "eaten") {
        this.target = { x: 13, y: 11 };
        return;
      }
      if (this.state === "frightened") return;
      if (this.state === "scatter" && this.elroy === 0) {
        this.target = this.scatterTile;
        return;
      }

      switch (this.name) {
        case "blinky":
          this.target = pt;
          break;
        case "pinky": {
          // riproduce anche il celebre "bug" della direzione verso l'alto
          let tx = pt.x + pd.x * 4, ty = pt.y + pd.y * 4;
          if (pac.dir === UP) tx -= 4;
          this.target = { x: tx, y: ty };
          break;
        }
        case "inky": {
          const b = game.ghosts[0];
          let px = pt.x + pd.x * 2, py = pt.y + pd.y * 2;
          if (pac.dir === UP) px -= 2;
          this.target = { x: px * 2 - b.tx, y: py * 2 - b.ty };
          break;
        }
        default: {  // clyde
          const d = Math.hypot(this.tx - pt.x, this.ty - pt.y);
          this.target = d > 8 ? pt : this.scatterTile;
          break;
        }
      }
    }

    moveOnGrid(dist, game) {
      while (dist > 1e-6) {
        const d = DIRS[this.dir];
        const tx = this.tx, ty = this.ty;
        const cx = (tx + 0.5) * T, cy = (ty + 0.5) * T;
        let toCenter = d.x ? (cx - this.x) * d.x : (cy - this.y) * d.y;
        if (toCenter < -1e-6) toCenter += T;

        if (toCenter <= dist) {
          this.x += d.x * toCenter;
          this.y += d.y * toCenter;
          dist -= toCenter;
          this.x = (this.tx + 0.5) * T;
          this.y = (this.ty + 0.5) * T;
          this.chooseDirection(game);
          if (this.state === "entering") return;
          const nd = DIRS[this.dir];
          const adv = Math.min(dist, T * 0.45);
          this.x += nd.x * adv;
          this.y += nd.y * adv;
          dist -= adv;
        } else {
          this.x += d.x * dist;
          this.y += d.y * dist;
          dist = 0;
        }
        this.wrap();
      }
    }

    chooseDirection(game) {
      const tx = this.tx, ty = this.ty;

      // arrivato sopra al cancello dopo essere stato mangiato: rientra in casa
      if (this.state === "eaten" && ty === 11 && (tx === 13 || tx === 14)) {
        this.state = "entering";
        this.path = [
          { x: HOUSE_X, y: GATE_Y },
          { x: HOUSE_X, y: HOUSE_Y },
          { x: this.homeX, y: this.parkY }
        ];
        return;
      }

      const gate = this.state === "eaten";
      const back = opposite(this.dir);
      const options = [];
      // ordine di preferenza in caso di parità: su, sinistra, giù, destra
      for (const dir of [UP, LEFT, DOWN, RIGHT]) {
        if (dir === back) continue;
        const d = DIRS[dir];
        if (!this.level.isWalkable(tx + d.x, ty + d.y, gate)) continue;
        if (dir === UP && NO_UP.indexOf(tx + "," + ty) >= 0 && !this.eaten) continue;
        options.push(dir);
      }
      if (!options.length) { this.dir = back; return; }

      if (this.state === "frightened") {
        this.dir = options[(Math.random() * options.length) | 0];
        return;
      }

      let best = options[0], bestDist = Infinity;
      for (const dir of options) {
        const d = DIRS[dir];
        const dx = tx + d.x - this.target.x;
        const dy = ty + d.y - this.target.y;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) { bestDist = dist; best = dir; }
      }
      this.dir = best;
    }

    draw(ctx) {
      const img = window.Assets.img;
      let row = this.index;
      if (this.eaten) {
        row = 6;
      } else if (this.state === "frightened") {
        const flashing = this.frightTimer <= 2 && Math.floor(this.frightTimer * 5) % 2 === 0;
        row = flashing ? 5 : 4;
      }
      const frame = Math.floor(this.anim) % 2;
      const col = this.dir * 2 + frame;
      ctx.drawImage(img.ghosts, col * SPRITE, row * SPRITE, SPRITE, SPRITE,
        this.x - SPRITE / 2, this.y - SPRITE / 2, SPRITE, SPRITE);
    }
  }

  function createGhosts(level) {
    return [
      new Ghost(level, 0, "blinky", { x: HOUSE_X, y: GATE_Y }, { x: 25, y: 0 }, LEFT, "scatter"),
      new Ghost(level, 1, "pinky", { x: HOUSE_X, y: HOUSE_Y }, { x: 2, y: 0 }, UP, "house"),
      new Ghost(level, 2, "inky", { x: 12 * T, y: HOUSE_Y }, { x: 27, y: 30 }, UP, "house"),
      new Ghost(level, 3, "clyde", { x: 16 * T, y: HOUSE_Y }, { x: 0, y: 30 }, UP, "house")
    ];
  }

  window.Entities = { Pacman, Ghost, createGhosts, DIRS, RIGHT, DOWN, LEFT, UP, HOUSE_X, HOUSE_Y, GATE_Y };
})();
