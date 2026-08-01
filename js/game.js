/* Motore di gioco: stati, punteggio, collisioni, HUD e disegno. */
(function () {
  "use strict";

  const M = window.MAZE;
  const T = M.TILE;
  const SPRITE = M.SPRITE;
  const CFG = window.CFG;
  const E = window.Entities;

  const W = M.COLS * T;                 // 672
  const HUD_TOP = 76;
  const HUD_BOTTOM = 44;
  const H = HUD_TOP + M.ROWS * T + HUD_BOTTOM;

  const FONT = '"Courier New", ui-monospace, SFMono-Regular, monospace';

  function text(ctx, str, x, y, size, color, align, weight) {
    ctx.font = (weight || 700) + " " + size + "px " + FONT;
    ctx.fillStyle = color;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) ctx.letterSpacing = Math.round(size * 0.12) + "px";
    ctx.fillText(str, x, y);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.canvas.width = W;
      this.canvas.height = H;
      this.ctx = canvas.getContext("2d");
      this.ctx.imageSmoothingEnabled = true;

      this.level = new window.Level();
      this.pacman = new E.Pacman(this.level);
      this.ghosts = E.createGhosts(this.level);

      this.highScore = Number(localStorage.getItem("pacman-record") || 0);
      this.state = "title";
      this.titleTime = 0;
      this.time = 0;
      this.paused = false;
      this.score = 0;
      this.lives = CFG.START_LIVES;
      this.levelNo = 1;
      this.params = CFG.params(1);
      this.fruitHistory = [];
      this.popup = null;
      this.fruit = null;
      this.message = "";
    }

    // ------------------------------------------------------------ ciclo partita
    startGame() {
      this.score = 0;
      this.lives = CFG.START_LIVES;
      this.levelNo = 1;
      this.fruitHistory = [];
      this.extraLifeGiven = false;
      this.newLevel();
      window.Sfx.start();
    }

    newLevel() {
      this.params = CFG.params(this.levelNo);
      this.level.reset();
      this.fruitHistory.push(this.params.fruit);
      if (this.fruitHistory.length > 7) this.fruitHistory.shift();
      this.fruit = null;
      this.fruitSpawned = 0;
      this.resetActors();
      this.setState("ready", 2.4);
      this.message = "PRONTO!";
    }

    resetActors() {
      this.pacman.reset();
      this.ghosts.forEach((g) => g.reset());
      this.waveIndex = 0;
      this.waveTimer = this.params.waves[0];
      this.chaseMode = false;
      this.frightTimer = 0;
      this.ghostsEaten = 0;
      this.houseDots = 0;
      this.releaseTimer = 0;
      this.popup = null;
      window.Sfx.setSiren("off");
    }

    setState(state, timer) {
      this.state = state;
      this.timer = timer || 0;
    }

    addScore(points) {
      this.score += points;
      if (!this.extraLifeGiven && this.score >= CFG.EXTRA_LIFE_AT) {
        this.extraLifeGiven = true;
        this.lives += 1;
        window.Sfx.extraLife();
      }
      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem("pacman-record", String(this.highScore));
      }
    }

    canLeaveHouse(ghost) {
      if (ghost.released) return true;
      if (this.releaseTimer >= this.params.releaseTimeout) return true;
      const need =
        ghost.name === "pinky" ? 0 : ghost.name === "inky" ? this.params.inkyDots : this.params.clydeDots;
      return this.houseDots >= need;
    }

    // ------------------------------------------------------------------ update
    update(dt) {
      this.time += dt;
      if (this.paused) return;

      switch (this.state) {
        case "title":
          this.titleTime += dt;
          window.Sfx.setSiren("off");
          break;

        case "ready":
          this.timer -= dt;
          if (this.timer <= 0) { this.message = ""; this.setState("play"); }
          break;

        case "play":
          this.updatePlay(dt);
          break;

        case "ghosteaten":
          this.timer -= dt;
          if (this.timer <= 0) {
            this.popup = null;
            this.ghosts.forEach((g) => { g.justEaten = false; });
            this.setState("play");
          }
          break;

        case "dying":
          this.timer -= dt;
          this.pacman.deathFrame += dt * 9;
          if (this.timer <= 0) this.loseLife();
          break;

        case "clear":
          this.timer -= dt;
          if (this.timer <= 0) {
            this.levelNo += 1;
            this.newLevel();
          }
          break;

        case "gameover":
          this.timer -= dt;
          if (this.timer <= 0) { this.state = "title"; this.titleTime = 0; }
          break;
        default:
          break;
      }

      if (this.popup) {
        this.popup.timer -= dt;
        if (this.popup.timer <= 0 && this.state !== "ghosteaten") this.popup = null;
      }
    }

    updatePlay(dt) {
      const p = this.params;

      // fasi dispersione / inseguimento
      if (this.frightTimer <= 0) {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0 && this.waveIndex < p.waves.length - 1) {
          this.waveIndex += 1;
          this.waveTimer = p.waves[this.waveIndex];
          this.chaseMode = this.waveIndex % 2 === 1;
          this.ghosts.forEach((g) => {
            g.queueReverse();
            g.setMode(this.chaseMode ? "chase" : "scatter");
          });
        }
      } else {
        this.frightTimer -= dt;
        if (this.frightTimer <= 0) this.ghostsEaten = 0;
      }

      // Pac-Man
      const speed = (this.frightTimer > 0 ? p.pacFrightSpeed : p.pacSpeed) * CFG.BASE_SPEED * T;
      this.pacman.update(dt, speed);
      this.eatDots();
      this.updateFruit(dt);

      // fantasmi
      this.releaseTimer += dt;
      this.ghosts.forEach((g) => g.update(dt, this));

      // Blinky diventa più aggressivo quando restano pochi pallini
      const b = this.ghosts[0];
      b.elroy = this.level.dotsLeft <= p.elroy1 / 2 ? 2 : this.level.dotsLeft <= p.elroy1 ? 1 : 0;

      this.checkCollisions();
      this.updateSiren();

      if (this.level.dotsLeft === 0) {
        window.Sfx.setSiren("off");
        window.Sfx.levelClear();
        this.setState("clear", 3.2);
      }
    }

    eatDots() {
      const pac = this.pacman;
      const d = this.level.eatDot(pac.tx, pac.ty);
      if (d === window.Level.EMPTY) return;
      this.houseDots += 1;
      this.releaseTimer = 0;
      if (d === window.Level.PELLET) {
        this.addScore(CFG.POINTS.pellet);
        window.Sfx.waka();
      } else {
        this.addScore(CFG.POINTS.power);
        window.Sfx.power();
        this.ghostsEaten = 0;
        if (this.params.frightSeconds > 0) {
          this.frightTimer = this.params.frightSeconds;
          this.ghosts.forEach((g) => g.frighten(this.params.frightSeconds));
        } else {
          this.ghosts.forEach((g) => g.queueReverse());
        }
      }
    }

    updateFruit(dt) {
      const dots = this.level.dotsEaten;
      if (this.fruitSpawned < CFG.FRUIT_DOTS.length && dots >= CFG.FRUIT_DOTS[this.fruitSpawned]) {
        this.fruitSpawned += 1;
        this.fruit = { x: 14 * T, y: 17.5 * T, timer: CFG.FRUIT_SECONDS, data: this.params.fruit };
      }
      if (!this.fruit) return;
      this.fruit.timer -= dt;
      if (this.fruit.timer <= 0) { this.fruit = null; return; }
      if (Math.hypot(this.pacman.x - this.fruit.x, this.pacman.y - this.fruit.y) < T * 0.7) {
        this.addScore(this.fruit.data.points);
        this.popup = { x: this.fruit.x, y: this.fruit.y, text: String(this.fruit.data.points), timer: 1.4, color: "#ffb8ff" };
        this.fruit = null;
        window.Sfx.fruit();
      }
    }

    checkCollisions() {
      for (const g of this.ghosts) {
        if (g.eaten || g.state === "house" || g.state === "leaving") continue;
        if (this.pacman.distanceTo(g) > T * 0.5) continue;
        if (g.state === "frightened") {
          const points = CFG.POINTS.ghost[Math.min(this.ghostsEaten, 3)];
          this.ghostsEaten += 1;
          this.addScore(points);
          g.state = "eaten";
          g.frightTimer = 0;
          g.justEaten = true;
          this.popup = { x: g.x, y: g.y, text: String(points), timer: 0.9, color: "#7ef9ff" };
          window.Sfx.eatGhost();
          this.setState("ghosteaten", 0.7);
          return;
        }
        this.die();
        return;
      }
    }

    die() {
      this.pacman.dying = true;
      this.pacman.deathFrame = 0;
      window.Sfx.setSiren("off");
      window.Sfx.death();
      this.setState("dying", 2.2);
    }

    loseLife() {
      this.lives -= 1;
      if (this.lives <= 0) {
        this.message = "GAME OVER";
        this.setState("gameover", 3.6);
        return;
      }
      this.resetActors();
      this.fruit = null;
      this.message = "PRONTO!";
      this.setState("ready", 2.0);
    }

    updateSiren() {
      let mode = "normal";
      if (this.ghosts.some((g) => g.eaten)) mode = "eyes";
      else if (this.frightTimer > 0) mode = "fright";
      window.Sfx.setSiren(mode);
    }

    // ---------------------------------------------------------------- comandi
    onDirection(dir) {
      if (this.state === "title") return;
      this.pacman.setDirection(dir);
    }

    onConfirm() {
      if (this.state === "title") this.startGame();
      else if (this.state === "gameover") { this.state = "title"; this.titleTime = 0; }
    }

    togglePause() {
      if (this.state === "title" || this.state === "gameover") return;
      this.paused = !this.paused;
      if (this.paused) window.Sfx.setSiren("off");
    }

    // ------------------------------------------------------------------ disegno
    draw() {
      const ctx = this.ctx;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      if (this.state === "title") { this.drawTitle(ctx); return; }

      this.drawTopHud(ctx);

      ctx.save();
      ctx.translate(0, HUD_TOP);
      const flash = this.state === "clear" && Math.floor(this.timer * 6) % 2 === 0;
      this.level.drawMaze(ctx, flash);
      if (this.state !== "clear") this.level.drawDots(ctx, this.time);

      const showFruit = this.state === "play" || this.state === "ready" || this.state === "ghosteaten";
      if (showFruit && this.fruit && (this.fruit.timer > 2 || Math.floor(this.fruit.timer * 6) % 2 === 0)) {
        ctx.drawImage(window.Assets.img.fruits, this.fruit.data.index * SPRITE, 0, SPRITE, SPRITE,
          this.fruit.x - SPRITE / 2, this.fruit.y - SPRITE / 2, SPRITE, SPRITE);
      }

      const hideGhosts = this.state === "dying" || this.state === "clear" || this.state === "gameover";
      if (!hideGhosts) {
        for (const g of this.ghosts) {
          if (this.state === "ghosteaten" && g.justEaten) continue;   // al suo posto compare il punteggio
          g.draw(ctx);
        }
      }
      if (this.state !== "clear" && this.state !== "ghosteaten") this.pacman.draw(ctx);

      if (this.popup) {
        text(ctx, this.popup.text, this.popup.x, this.popup.y, 20, this.popup.color, "center");
      }

      if (this.message) {
        const color = this.state === "gameover" ? "#ff3b3b" : "#ffd400";
        text(ctx, this.message, W / 2, 20.5 * T, 26, color, "center");
      }
      if (this.paused) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, W, M.ROWS * T);
        text(ctx, "PAUSA", W / 2, 15 * T, 40, "#ffd400", "center");
        text(ctx, "premi P per continuare", W / 2, 17 * T, 18, "#9aa6ff", "center");
      }
      ctx.restore();

      this.drawBottomHud(ctx);
    }

    drawTopHud(ctx) {
      text(ctx, "PUNTI", 24, 22, 16, "#9aa6ff");
      text(ctx, String(this.score).padStart(6, "0"), 24, 50, 26, "#fff");

      text(ctx, "RECORD", W / 2, 22, 16, "#9aa6ff", "center");
      text(ctx, String(this.highScore).padStart(6, "0"), W / 2, 50, 26, "#ffd400", "center");

      text(ctx, "LIVELLO", W - 24, 22, 16, "#9aa6ff", "right");
      text(ctx, String(this.levelNo), W - 24, 50, 26, "#fff", "right");
    }

    drawBottomHud(ctx) {
      const y = H - HUD_BOTTOM / 2;
      const img = window.Assets.img;
      for (let i = 0; i < Math.max(0, this.lives - 1); i++) {
        ctx.drawImage(img.pacman, 2 * SPRITE, 0, SPRITE, SPRITE, 20 + i * 36, y - 16, 32, 32);
      }
      for (let i = 0; i < this.fruitHistory.length; i++) {
        const f = this.fruitHistory[this.fruitHistory.length - 1 - i];
        ctx.drawImage(img.fruits, f.index * SPRITE, 0, SPRITE, SPRITE, W - 52 - i * 36, y - 16, 32, 32);
      }
    }

    drawTitle(ctx) {
      const img = window.Assets.img;
      const t = this.titleTime;
      ctx.drawImage(img.logo, (W - img.logo.width) / 2, 90);

      const cast = [
        { row: 0, name: "BLINKY", desc: "ti insegue senza sosta", color: "#ff5555" },
        { row: 1, name: "PINKY", desc: "ti taglia la strada", color: "#ffa8de" },
        { row: 2, name: "INKY", desc: "imprevedibile", color: "#4fe8ff" },
        { row: 3, name: "CLYDE", desc: "va per conto suo", color: "#ffa83c" }
      ];
      cast.forEach((c, i) => {
        const y = 300 + i * 62;
        const frame = Math.floor(t * 6) % 2;
        ctx.drawImage(img.ghosts, frame * SPRITE, c.row * SPRITE, SPRITE, SPRITE, 150, y - 24, SPRITE, SPRITE);
        text(ctx, c.name, 215, y - 8, 20, c.color);
        text(ctx, c.desc, 215, y + 14, 15, "#8a93c8", "left", 400);
      });

      // dimostrazione: Pac-Man inseguito dai fantasmi
      const demoY = 600;
      const cycle = 8;
      const k = (t % cycle) / cycle;
      const fleeing = k > 0.5;
      const pacX = fleeing ? W * (2 * k - 1) * 1.1 - 60 : W * 1.1 * (1 - 2 * k) + 60;
      const pacDir = fleeing ? 0 : 2;
      const frame = [1, 2, 1, 0][Math.floor(t * 10) % 4];
      ctx.drawImage(img.pacman, frame * SPRITE, pacDir * SPRITE, SPRITE, SPRITE, pacX - 24, demoY - 24, SPRITE, SPRITE);
      for (let i = 0; i < 4; i++) {
        const gx = pacX + (fleeing ? -1 : 1) * (60 + i * 42);
        const row = fleeing ? (Math.floor(t * 5) % 2 ? 5 : 4) : i;
        const gcol = (fleeing ? 2 : 0) * 2 + (Math.floor(t * 8) % 2);
        ctx.drawImage(img.ghosts, gcol * SPRITE, row * SPRITE, SPRITE, SPRITE, gx - 24, demoY - 24, SPRITE, SPRITE);
      }

      if (Math.floor(t * 2) % 2 === 0) {
        text(ctx, "PREMI INVIO PER GIOCARE", W / 2, 700, 24, "#ffd400", "center");
      }
      text(ctx, "frecce o WASD per muoverti  ·  P pausa  ·  M audio", W / 2, 745, 15, "#8a93c8", "center");
      text(ctx, "RECORD  " + String(this.highScore).padStart(6, "0"), W / 2, 800, 18, "#9aa6ff", "center");
    }
  }

  Game.WIDTH = W;
  Game.HEIGHT = H;
  window.Game = Game;
})();
