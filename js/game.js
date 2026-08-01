/* Regia del gioco: stati, telecamera, luci, particelle, interfaccia. */
(function () {
  "use strict";

  const TILE = window.World.TILE;
  const FRAME = 48;
  const W = 960;
  const H = 540;

  const SERIF = 'Georgia, "Iowan Old Style", "Palatino Linotype", serif';
  const SANS = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignorato */ } }
  };

  function text(ctx, str, x, y, size, color, align, font, alpha) {
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.font = size + "px " + (font || SANS);
    ctx.fillStyle = color;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  class Game {
    constructor(canvas, input) {
      this.canvas = canvas;
      canvas.width = W;
      canvas.height = H;
      this.ctx = canvas.getContext("2d");
      this.input = input;

      this.lightCanvas = document.createElement("canvas");
      this.lightCanvas.width = W;
      this.lightCanvas.height = H;
      this.lightCtx = this.lightCanvas.getContext("2d");

      this.time = 0;
      this.paused = false;
      this.state = "title";
      this.timer = 0;
      this.levelIndex = 0;
      this.totalFireflies = 0;
      this.deaths = 0;
      this.best = Number(store.get("forest-tale-record") || 0);
      this.particles = [];
      this.motes = [];
      this.cam = { x: 0, y: 0 };
      this.titleWorld = null;

      input.onAction = () => this.confirm();
      input.onKey = (key) => {
        if (key === "p" || key === "P") this.togglePause();
        if (key === "r" || key === "R") this.restartLevel();
      };
    }

    // ------------------------------------------------------------- partita
    start() {
      this.levelIndex = 0;
      this.totalFireflies = 0;
      this.deaths = 0;
      this.loadLevel(0);
      window.Sfx.start();
    }

    loadLevel(index) {
      this.levelIndex = index;
      this.world = new window.World(window.LEVELS[index]);
      this.player = new window.Player(this.world);
      this.spawnEnemies();
      this.checkpoint = { x: this.world.start.x, y: this.world.start.y };
      this.hp = 3;
      this.collected = 0;
      this.streak = 0;
      this.particles.length = 0;
      this.buildMotes();
      this.cam.x = 0;
      this.cam.y = 0;
      this.updateCamera(1);
      this.setState("intro", 2.6);
    }

    spawnEnemies() {
      this.enemies = this.world.spawns.map((s) =>
        s.type === "beetle"
          ? new window.Enemies.Beetle(this.world, s.x, s.y)
          : new window.Enemies.Wisp(this.world, s.x, s.y));
    }

    /** Pulviscolo luminoso che vaga per il livello. */
    buildMotes() {
      this.motes = [];
      const n = Math.floor(this.world.pixelW / 150);
      for (let i = 0; i < n; i++) {
        this.motes.push({
          x: Math.random() * this.world.pixelW,
          y: 120 + Math.random() * (this.world.pixelH - 200),
          phase: Math.random() * Math.PI * 2,
          speed: 6 + Math.random() * 14,
          size: 1.4 + Math.random() * 1.8
        });
      }
    }

    setState(state, timer) {
      this.state = state;
      this.timer = timer || 0;
    }

    restartLevel() {
      if (this.state === "play" || this.state === "dead") this.loadLevel(this.levelIndex);
    }

    togglePause() {
      if (this.state === "title") return;
      this.paused = !this.paused;
    }

    confirm() {
      if (this.state === "title") this.start();
      else if (this.state === "clear") {
        if (this.levelIndex + 1 < window.LEVELS.length) this.loadLevel(this.levelIndex + 1);
        else this.finish();
      } else if (this.state === "finale") this.setState("title");
      else if (this.state === "intro") this.setState("play");
    }

    finish() {
      if (this.totalFireflies > this.best) {
        this.best = this.totalFireflies;
        store.set("forest-tale-record", String(this.best));
      }
      this.setState("finale");
    }

    // ------------------------------------------------------------- eventi
    onJump() { window.Sfx.jump(); }

    onLand(player) {
      window.Sfx.land();
      for (let i = 0; i < 6; i++) {
        this.particles.push({
          x: player.cx + (Math.random() - 0.5) * 16, y: player.y + player.h,
          vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 60,
          life: 0.4, max: 0.4, size: 2.4, color: "190,200,180", gravity: 260
        });
      }
    }

    burst(x, y, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.8);
        this.particles.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
          life: 0.6, max: 0.6, size: 2 + Math.random() * 2, color, gravity: 120
        });
      }
    }

    // ------------------------------------------------------------- update
    update(dt) {
      this.time += dt;
      if (this.paused) return;

      switch (this.state) {
        case "title":
          break;
        case "intro":
          this.timer -= dt;
          this.updateMotes(dt);
          if (this.timer <= 0) this.setState("play");
          break;
        case "play":
          this.updatePlay(dt);
          break;
        case "dead":
          this.timer -= dt;
          this.updateParticles(dt);
          if (this.timer <= 0) this.respawn();
          break;
        case "clear":
          this.timer = Math.max(0, this.timer - dt);
          this.updateMotes(dt);
          this.updateParticles(dt);
          break;
        default:
          break;
      }
    }

    updatePlay(dt) {
      const p = this.player;
      p.update(dt, this.input, this);
      for (const e of this.enemies) e.update(dt);

      this.checkEnemies();
      this.checkHazards();
      this.checkPickups();
      this.updateCamera(dt);
      this.updateParticles(dt);
      this.updateMotes(dt);

      if (p.y > this.world.pixelH + 40) this.die();
    }

    checkEnemies() {
      const p = this.player;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (p.x + p.w < e.x || p.x > e.x + e.w || p.y + p.h < e.y || p.y > e.y + e.h) continue;
        const stomping = e.stompable && p.vy > 40 && (p.y + p.h) < e.y + e.h * 0.7;
        if (stomping) {
          e.stomp();
          p.bounce();
          window.Sfx.stomp();
          this.burst(e.cx, e.cy, "168,120,230", 12, 150);
        } else if (p.hurt(e.cx)) {
          this.damage();
        }
      }
    }

    checkHazards() {
      const p = this.player;
      const x0 = Math.floor((p.x + 4) / TILE), x1 = Math.floor((p.x + p.w - 4) / TILE);
      const y0 = Math.floor((p.y + 6) / TILE), y1 = Math.floor((p.y + p.h - 1) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (this.world.isThorn(tx, ty) && p.hurt(tx * TILE + TILE / 2)) {
            this.damage();
            return;
          }
        }
      }
    }

    checkPickups() {
      const p = this.player;
      for (const f of this.world.fireflies) {
        if (f.taken) continue;
        if (Math.hypot(p.cx - f.x, p.cy - f.y) > 28) continue;
        f.taken = true;
        this.collected += 1;
        this.streak += 1;
        this.totalFireflies += 1;
        window.Sfx.collect(this.streak);
        this.burst(f.x, f.y, "255,206,120", 10, 120);
      }
      for (const l of this.world.lanterns) {
        if (l.lit) continue;
        if (Math.hypot(p.cx - l.x, p.cy - l.y) > 34) continue;
        l.lit = true;
        this.checkpoint = { x: l.x, y: l.y + TILE / 2 };
        window.Sfx.lantern();
        this.burst(l.x, l.y, "255,186,92", 16, 130);
      }
      const d = this.world.door;
      if (d && Math.hypot(p.cx - d.x, p.cy - (d.y - 40)) < 44) {
        d.open = true;
        window.Sfx.door();
        window.Sfx.levelClear();
        this.setState("clear", 0.8);
      }
    }

    damage() {
      this.streak = 0;
      this.hp -= 1;
      this.burst(this.player.cx, this.player.cy, "255,140,120", 12, 140);
      if (this.hp <= 0) this.die();
      else window.Sfx.hurt();
    }

    die() {
      if (this.state === "dead") return;
      this.deaths += 1;
      this.player.dead = true;
      window.Sfx.death();
      this.burst(this.player.cx, this.player.cy, "255,186,92", 20, 190);
      this.setState("dead", 1.1);
    }

    respawn() {
      this.hp = 3;
      this.streak = 0;
      this.player.reset(this.checkpoint);
      this.spawnEnemies();
      this.updateCamera(1);
      this.setState("play");
    }

    updateCamera(dt) {
      const p = this.player;
      const tx = p.cx + p.facing * 74 - W / 2;
      const ty = p.cy - H * 0.60;
      const k = Math.min(1, dt * 5.5);
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
      this.cam.x = Math.max(0, Math.min(this.world.pixelW - W, this.cam.x));
      this.cam.y = Math.max(0, Math.min(Math.max(0, this.world.pixelH - H), this.cam.y));
    }

    updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const q = this.particles[i];
        q.life -= dt;
        if (q.life <= 0) { this.particles.splice(i, 1); continue; }
        q.vy += (q.gravity || 0) * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
      }
    }

    updateMotes(dt) {
      for (const m of this.motes) {
        m.phase += dt * 0.8;
        m.x += Math.cos(m.phase) * m.speed * dt;
        m.y += Math.sin(m.phase * 1.3) * m.speed * dt;
      }
    }

    // ------------------------------------------------------------- disegno
    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, W, H);
      if (this.state === "title") { this.drawTitle(ctx); return; }

      this.drawBackground(ctx);
      ctx.save();
      ctx.translate(-Math.round(this.cam.x), -Math.round(this.cam.y));
      this.world.drawStatic(ctx, { x: 0, y: 0 });
      this.world.drawDoor(ctx, this.time);
      this.world.drawPickups(ctx, this.time);
      for (const e of this.enemies) e.draw(ctx);
      if (this.state !== "dead") this.player.draw(ctx, this.time);
      this.drawParticles(ctx);
      ctx.restore();

      this.drawLighting(ctx);
      this.drawMotes(ctx);
      if (this.state !== "finale") this.drawHud(ctx);

      if (this.state === "intro") this.drawCard(ctx);
      if (this.state === "clear") this.drawClear(ctx);
      if (this.state === "finale") this.drawFinale(ctx);
      if (this.paused) this.drawPause(ctx);
    }

    drawBackground(ctx) {
      const img = window.Assets.img;
      ctx.drawImage(img.sky, 0, 0, W, H);
      const layers = [[img.treesFar, 0.15], [img.treesMid, 0.34], [img.treesNear, 0.62]];
      for (const [layer, k] of layers) {
        let off = -(this.cam.x * k) % layer.width;
        if (off > 0) off -= layer.width;
        for (let x = off; x < W; x += layer.width) {
          ctx.drawImage(layer, Math.round(x), Math.round(-this.cam.y * k * 0.3));
        }
      }
      const mist = img.mist;
      let mo = -(this.cam.x * 0.46) % mist.width;
      if (mo > 0) mo -= mist.width;
      for (let x = mo; x < W; x += mist.width) {
        ctx.drawImage(mist, Math.round(x), Math.round(H - 250 - this.cam.y * 0.2));
      }
    }

    collectLights() {
      const out = [];
      const lp = this.player.lightPos();
      out.push({ x: lp.x, y: lp.y, r: 168, warm: 0.75 });
      this.world.lights(out);
      for (const e of this.enemies) e.lights(out);
      return out;
    }

    drawLighting(ctx) {
      const lx = this.lightCtx;
      lx.globalCompositeOperation = "source-over";
      lx.clearRect(0, 0, W, H);
      lx.fillStyle = "rgba(6,11,26,0.62)";
      lx.fillRect(0, 0, W, H);
      lx.globalCompositeOperation = "destination-out";

      const lights = this.collectLights();
      const warm = [];
      for (const l of lights) {
        const sx = l.x - this.cam.x, sy = l.y - this.cam.y;
        if (sx < -l.r || sx > W + l.r || sy < -l.r || sy > H + l.r) continue;
        const g = lx.createRadialGradient(sx, sy, 0, sx, sy, l.r);
        g.addColorStop(0, "rgba(0,0,0,0.95)");
        g.addColorStop(0.45, "rgba(0,0,0,0.55)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        lx.fillStyle = g;
        lx.fillRect(sx - l.r, sy - l.r, l.r * 2, l.r * 2);
        if (l.warm > 0) warm.push({ sx, sy, r: l.r, w: l.warm });
      }
      lx.globalCompositeOperation = "source-over";
      ctx.drawImage(this.lightCanvas, 0, 0);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const l of warm) {
        const g = ctx.createRadialGradient(l.sx, l.sy, 0, l.sx, l.sy, l.r * 0.9);
        g.addColorStop(0, "rgba(255,186,92," + (0.20 * l.w).toFixed(3) + ")");
        g.addColorStop(1, "rgba(255,186,92,0)");
        ctx.fillStyle = g;
        ctx.fillRect(l.sx - l.r, l.sy - l.r, l.r * 2, l.r * 2);
      }
      ctx.restore();
    }

    drawParticles(ctx) {
      for (const q of this.particles) {
        const a = Math.max(0, q.life / q.max);
        ctx.fillStyle = "rgba(" + q.color + "," + a.toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size * a + 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawMotes(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const m of this.motes) {
        const sx = m.x - this.cam.x * 0.9, sy = m.y - this.cam.y * 0.9;
        if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
        const a = 0.30 + 0.30 * Math.sin(m.phase * 2.2);
        ctx.fillStyle = "rgba(255,206,130," + a.toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(sx, sy, m.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    drawHud(ctx) {
      const img = window.Assets.img;
      for (let i = 0; i < 3; i++) {
        ctx.drawImage(img.leaf, i < this.hp ? 0 : 32, 0, 32, 32, 18 + i * 30, 16, 28, 28);
      }
      ctx.drawImage(img.props, window.World.PROP.firefly * FRAME, 0, FRAME, FRAME, 116, 10, 40, 40);
      text(ctx, this.collected + " / " + this.world.totalFireflies, 154, 31, 20, "#ffdca6", "left", SANS);
      text(ctx, this.world.name, W - 20, 28, 19, "rgba(200,214,230,0.75)", "right", SERIF);
    }

    panel(ctx, y, h) {
      ctx.fillStyle = "rgba(8,14,28,0.82)";
      ctx.fillRect(0, y, W, h);
      ctx.fillStyle = "rgba(255,186,92,0.35)";
      ctx.fillRect(0, y, W, 1);
      ctx.fillRect(0, y + h - 1, W, 1);
    }

    drawCard(ctx) {
      const a = Math.min(1, this.timer / 0.5);
      ctx.save();
      ctx.globalAlpha = a;
      this.panel(ctx, 176, 190);
      text(ctx, "Capitolo " + (this.levelIndex + 1), W / 2, 218, 20, "rgba(122,232,200,0.9)", "center", SANS);
      text(ctx, this.world.name, W / 2, 262, 40, "#ffe6bd", "center", SERIF);
      text(ctx, this.world.hint, W / 2, 314, 18, "rgba(206,216,232,0.8)", "center", SANS);
      ctx.restore();
    }

    drawClear(ctx) {
      this.panel(ctx, 150, 250);
      text(ctx, "Capitolo concluso", W / 2, 196, 22, "rgba(122,232,200,0.9)", "center", SANS);
      text(ctx, this.world.name, W / 2, 240, 36, "#ffe6bd", "center", SERIF);
      text(ctx, "Lucciole raccolte  " + this.collected + " / " + this.world.totalFireflies,
        W / 2, 296, 22, "#ffdca6", "center", SANS);
      const last = this.levelIndex + 1 >= window.LEVELS.length;
      if (Math.floor(this.time * 2) % 2 === 0) {
        text(ctx, last ? "INVIO per l'ultima pagina" : "INVIO per il capitolo successivo",
          W / 2, 352, 20, "rgba(220,230,240,0.9)", "center", SANS);
      }
    }

    drawFinale(ctx) {
      ctx.fillStyle = "rgba(6,11,26,0.86)";
      ctx.fillRect(0, 0, W, H);
      text(ctx, "Fine della storia", W / 2, 150, 46, "#ffe6bd", "center", SERIF);
      text(ctx, "La volpe è tornata a casa con " + this.totalFireflies + " lucciole.",
        W / 2, 220, 22, "rgba(216,226,240,0.9)", "center", SANS);
      text(ctx, "Cadute: " + this.deaths + "     Record di lucciole: " + this.best,
        W / 2, 260, 19, "rgba(150,170,190,0.9)", "center", SANS);
      if (Math.floor(this.time * 2) % 2 === 0) {
        text(ctx, "INVIO per ricominciare", W / 2, 340, 20, "rgba(122,232,200,0.95)", "center", SANS);
      }
    }

    drawPause(ctx) {
      ctx.fillStyle = "rgba(6,11,26,0.72)";
      ctx.fillRect(0, 0, W, H);
      text(ctx, "Pausa", W / 2, 240, 44, "#ffe6bd", "center", SERIF);
      text(ctx, "P per riprendere · R per ricominciare il capitolo",
        W / 2, 296, 19, "rgba(206,216,232,0.85)", "center", SANS);
    }

    drawTitle(ctx) {
      const img = window.Assets.img;
      ctx.drawImage(img.sky, 0, 0, W, H);
      const t = this.time;
      const layers = [[img.treesFar, 6], [img.treesMid, 14], [img.treesNear, 26]];
      for (const [layer, k] of layers) {
        const off = -((t * k) % layer.width);
        for (let x = off; x < W; x += layer.width) ctx.drawImage(layer, Math.round(x), 0);
      }
      ctx.drawImage(img.mist, Math.round(-((t * 10) % img.mist.width)), H - 250);

      // la volpe cammina sul bordo inferiore
      const foxX = W / 2 - 24 + Math.sin(t * 0.5) * 210;
      const frame = Math.floor(t * 9) % 6;
      ctx.save();
      const facing = Math.cos(t * 0.5) >= 0 ? 1 : -1;
      if (facing < 0) {
        ctx.translate(foxX + FRAME, H - 62);
        ctx.scale(-1, 1);
        ctx.drawImage(img.fox, frame * FRAME, FRAME, FRAME, FRAME, 0, 0, FRAME, FRAME);
      } else {
        ctx.drawImage(img.fox, frame * FRAME, FRAME, FRAME, FRAME, foxX, H - 62, FRAME, FRAME);
      }
      ctx.restore();

      ctx.fillStyle = "rgba(6,11,26,0.45)";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img.logo, (W - img.logo.width) / 2, 74);

      if (Math.floor(t * 2) % 2 === 0) {
        text(ctx, "PREMI INVIO PER COMINCIARE", W / 2, 348, 22, "#ffdca6", "center", SANS);
      }
      text(ctx, "← → per correre · SPAZIO per saltare · GIÙ+SPAZIO per scendere dalle assi",
        W / 2, 420, 17, "rgba(190,204,220,0.8)", "center", SANS);
      text(ctx, "P pausa · R ricomincia il capitolo · M audio",
        W / 2, 448, 17, "rgba(150,170,190,0.75)", "center", SANS);
      if (this.best > 0) {
        text(ctx, "Record di lucciole: " + this.best, W / 2, 490, 18, "rgba(122,232,200,0.9)", "center", SANS);
      }
    }
  }

  Game.WIDTH = W;
  Game.HEIGHT = H;
  window.Game = Game;
})();
