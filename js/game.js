/* Regia: stati, onda d'urto, consegna al macchinario, portale, interfaccia. */
(function () {
  "use strict";

  const TILE = window.Arena.TILE;
  const W = 960;
  const HUD = 28;
  const H = HUD + window.Arena.ROWS * TILE;      // 28 + 512 = 540

  const SERIF = 'Georgia, "Palatino Linotype", "Times New Roman", serif';
  const SANS = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

  const GRAB_DIST = 32;
  const HEARTS = 3;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignorato */ } }
  };

  function text(ctx, str, x, y, size, color, align, font) {
    ctx.font = size + "px " + (font || SANS);
    ctx.fillStyle = color;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(str, x, y);
  }

  class Game {
    constructor(canvas, input) {
      canvas.width = W;
      canvas.height = H;
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.input = input;

      // il canvas del buio copre solo l'arena: le luci usano le sue coordinate
      this.lightCanvas = document.createElement("canvas");
      this.lightCanvas.width = W;
      this.lightCanvas.height = window.Arena.ROWS * TILE;
      this.lightCtx = this.lightCanvas.getContext("2d");

      this.time = 0;
      this.paused = false;
      this.state = "title";
      this.timer = 0;
      this.index = 0;
      this.hearts = HEARTS;
      this.hammers = 0;
      this.elapsed = 0;
      this.best = Number(store.get("martello-record") || 0);
      this.waves = [];
      this.particles = [];

      input.onAction = () => this.confirm();
      input.onKey = (key) => {
        if (key === "p" || key === "P") this.togglePause();
        if (key === "r" || key === "R") this.restart();
      };
    }

    // -------------------------------------------------------------- partita
    start() {
      this.index = 0;
      this.hammers = 0;
      this.elapsed = 0;
      this.load(0);
      window.Sfx.start();
    }

    load(index) {
      this.index = index;
      this.arena = new window.Arena(window.ARENAS[index]);
      this.dwarf = new window.Dwarf(this.arena);
      this.imps = this.arena.spawns.map((s) =>
        new window.Imp(this.arena, s.x, s.y, this.arena.impSpeed, this.arena.stun));
      this.total = this.imps.length;
      this.boxed = 0;
      this.hearts = HEARTS;
      this.waves.length = 0;
      this.particles.length = 0;
      this.portalOpen = false;
      this.portalT = 0;
      this.setState("intro", 2.8);
    }

    restart() {
      if (this.state === "play" || this.state === "dead") this.load(this.index);
    }

    setState(state, timer) { this.state = state; this.timer = timer || 0; }

    togglePause() {
      if (this.state === "title") return;
      this.paused = !this.paused;
    }

    confirm() {
      if (this.state === "title") this.start();
      else if (this.state === "intro") this.setState("play");
      else if (this.state === "finale") this.setState("title");
    }

    finish() {
      const score = Math.round(this.elapsed);
      if (this.best === 0 || score < this.best) {
        this.best = score;
        store.set("martello-record", String(score));
      }
      this.setState("finale");
    }

    // --------------------------------------------------------------- eventi
    /** Il martello tocca terra: onda d'urto che spinge e stordisce. */
    onHammer(point) {
      this.hammers += 1;
      this.waves.push({ x: point.x, y: point.y, t: 0, max: 0.36 });
      window.Sfx.hammer();
      this.dust(point.x, point.y, 14);

      let hit = 0;
      // chi è in spalla non viene spinto, ma il colpo gli rinnova il torpore
      const carried = this.dwarf.carrying;
      if (carried && !carried.boxed) {
        carried.stun = this.arena.stun;
        this.burst(carried.x, carried.y, "255,226,130", 8, 110);
      }
      for (const imp of this.imps) {
        if (imp.boxed || imp.state === "carried") continue;
        const d = Math.hypot(imp.x - point.x, imp.y - point.y);
        if (d > window.Dwarf.SHOCK_R) continue;
        const power = 340 * (1 - d / window.Dwarf.SHOCK_R) + 150;
        imp.shock(point.x, point.y, power, this.arena.stun);
        hit += 1;
        this.burst(imp.x, imp.y, "255,226,130", 10, 150);
      }
      if (hit > 0) window.Sfx.stun();
    }

    releaseCarried() {
      const imp = this.dwarf.carrying;
      if (!imp) return;
      imp.state = "stunned";
      imp.vx = 0;
      imp.vy = 0;
      this.dwarf.carrying = null;
      window.Sfx.drop();
    }

    dust(x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 60 + Math.random() * 140;
        this.particles.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5,
          life: 0.45, max: 0.45, size: 2 + Math.random() * 2, color: "150,142,160"
        });
      }
    }

    burst(x, y, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.8);
        this.particles.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          life: 0.55, max: 0.55, size: 2 + Math.random() * 2, color
        });
      }
    }

    // --------------------------------------------------------------- update
    update(dt) {
      this.time += dt;
      if (this.paused) return;

      switch (this.state) {
        case "intro":
          this.timer -= dt;
          if (this.timer <= 0) this.setState("play");
          break;
        case "play":
          this.elapsed += dt;
          this.updatePlay(dt);
          break;
        case "dead":
          this.timer -= dt;
          this.updateEffects(dt);
          if (this.timer <= 0) this.load(this.index);
          break;
        case "clear":
          this.timer -= dt;
          this.updateEffects(dt);
          if (this.timer <= 0) {
            if (this.index + 1 < window.ARENAS.length) this.load(this.index + 1);
            else this.finish();
          }
          break;
        default:
          break;
      }
    }

    updatePlay(dt) {
      const dwarf = this.dwarf;
      dwarf.update(dt, this.input, this);
      for (const imp of this.imps) if (!imp.boxed) imp.update(dt, dwarf);

      this.checkCarry(dt);
      this.checkContact();
      this.checkMachine();
      this.updateEffects(dt);

      if (this.arena.machine.anim > 0) this.arena.machine.anim -= dt;

      if (this.boxed >= this.total && !this.portalOpen) {
        this.portalOpen = true;
        window.Sfx.portal();
      }
      if (this.portalOpen) {
        this.portalT = Math.min(1, this.portalT + dt * 1.6);
        const p = this.arena.portalSpot;
        if (this.portalT >= 1 && Math.hypot(dwarf.x - p.x, dwarf.y - p.y) < 30) {
          window.Sfx.enterPortal();
          this.setState("clear", 1.0);
        }
      }
    }

    checkCarry(dt) {
      const dwarf = this.dwarf;
      const carried = dwarf.carrying;
      if (carried) {
        if (carried.stun <= 0) {           // si è svegliato mentre lo trascinavi
          carried.breakFree(dwarf);
          dwarf.carrying = null;
          dwarf.hurt(carried.x, carried.y);      // spintone, ma nessun cuore perso
          window.Sfx.free();
        }
        return;
      }
      if (dwarf.swinging) return;
      for (const imp of this.imps) {
        if (imp.boxed || imp.state !== "stunned") continue;
        if (Math.hypot(imp.x - dwarf.x, imp.y - dwarf.y) > GRAB_DIST) continue;
        imp.state = "carried";
        dwarf.carrying = imp;
        window.Sfx.grab();
        break;
      }
    }

    checkContact() {
      const dwarf = this.dwarf;
      for (const imp of this.imps) {
        if (imp.boxed || imp.stunned) continue;
        if (Math.hypot(imp.x - dwarf.x, imp.y - dwarf.y) > imp.r + dwarf.r + 2) continue;
        if (!dwarf.hurt(imp.x, imp.y)) continue;
        this.hearts -= 1;
        window.Sfx.hurt();
        this.burst(dwarf.x, dwarf.y, "226,78,84", 12, 160);
        const a = Math.atan2(imp.y - dwarf.y, imp.x - dwarf.x);
        imp.vx = Math.cos(a) * imp.speed * 2;
        imp.vy = Math.sin(a) * imp.speed * 2;
        if (this.hearts <= 0) this.lose();
        return;
      }
    }

    checkMachine() {
      const dwarf = this.dwarf;
      const imp = dwarf.carrying;
      if (!imp) return;
      const gate = this.arena.machine.intake;
      if (Math.hypot(dwarf.x - gate.x, dwarf.y - gate.y) > gate.r) return;
      imp.boxed = true;
      imp.state = "boxed";
      dwarf.carrying = null;
      this.boxed += 1;
      this.arena.machine.crates += 1;
      this.arena.machine.anim = 0.9;
      window.Sfx.box();
      this.burst(gate.x, gate.y, "122,214,226", 16, 170);
    }

    lose() {
      window.Sfx.lose();
      this.setState("dead", 1.6);
    }

    updateEffects(dt) {
      for (let i = this.waves.length - 1; i >= 0; i--) {
        const w = this.waves[i];
        w.t += dt;
        if (w.t > w.max) this.waves.splice(i, 1);
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const q = this.particles[i];
        q.life -= dt;
        if (q.life <= 0) { this.particles.splice(i, 1); continue; }
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vx *= 0.94;
        q.vy *= 0.94;
      }
    }

    // -------------------------------------------------------------- disegno
    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, W, H);
      if (this.state === "title") { this.drawTitle(ctx); return; }

      ctx.save();
      ctx.translate(0, HUD);
      this.arena.drawFloor(ctx);
      this.drawWaves(ctx);
      this.arena.drawTorches(ctx, this.time);
      this.drawPortal(ctx);
      this.arena.drawMachine(ctx, this.time);

      // ordine di profondità: chi sta più in basso è davanti
      const actors = this.imps.filter((i) => !i.boxed).concat([this.dwarf]);
      actors.sort((a, b) => a.y - b.y);
      for (const a of actors) {
        if (a === this.dwarf) { if (this.state !== "dead") a.draw(ctx); }
        else a.draw(ctx, this.time);
      }
      this.drawParticles(ctx);
      this.drawLighting(ctx);
      ctx.restore();

      this.drawHud(ctx);
      if (this.state === "intro") this.drawCard(ctx);
      if (this.state === "dead") this.drawDead(ctx);
      if (this.state === "finale") this.drawFinale(ctx);
      if (this.paused) this.drawPause(ctx);
    }

    drawWaves(ctx) {
      for (const w of this.waves) {
        const t = w.t / w.max;
        const r = window.Dwarf.SHOCK_R * (0.25 + t * 0.95);
        ctx.save();
        ctx.globalAlpha = (1 - t) * 0.85;
        ctx.strokeStyle = "rgba(255,226,172,0.9)";
        ctx.lineWidth = 5 * (1 - t) + 1.5;
        ctx.beginPath();
        ctx.ellipse(w.x, w.y, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawPortal(ctx) {
      if (!this.portalOpen) return;
      const p = this.arena.portalSpot;
      const img = window.Assets.img.portal;
      const frame = Math.floor(this.time * 10) % 4;
      const k = this.portalT;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(k, k);
      ctx.drawImage(img, frame * 96, 0, 96, 96, -48, -48, 96, 96);
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

    drawLighting(ctx) {
      const lx = this.lightCtx;
      lx.globalCompositeOperation = "source-over";
      const LH = this.lightCanvas.height;
      lx.clearRect(0, 0, W, LH);
      lx.fillStyle = "rgba(12,9,20,0.34)";
      lx.fillRect(0, 0, W, LH);
      lx.globalCompositeOperation = "destination-out";

      const lights = [{ x: this.dwarf.x, y: this.dwarf.y, r: 140, warm: 1 }];
      this.arena.lights(lights);
      for (const imp of this.imps) {
        if (!imp.boxed) lights.push({ x: imp.x, y: imp.y, r: 62, warm: 0 });
      }
      for (const w of this.waves) lights.push({ x: w.x, y: w.y, r: 130 * (1 - w.t / w.max), warm: 1 });
      if (this.portalOpen) {
        const p = this.arena.portalSpot;
        lights.push({ x: p.x, y: p.y, r: 150 * this.portalT, warm: 0 });
      }

      for (const l of lights) {
        if (l.r <= 1) continue;
        const g = lx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
        g.addColorStop(0, "rgba(0,0,0,0.95)");
        g.addColorStop(0.5, "rgba(0,0,0,0.5)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        lx.fillStyle = g;
        lx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
      }
      lx.globalCompositeOperation = "source-over";
      ctx.drawImage(this.lightCanvas, 0, 0);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const l of lights) {
        if (!l.warm || l.r <= 1) continue;
        const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 0.85);
        g.addColorStop(0, "rgba(255,178,92," + (0.16 * l.warm).toFixed(3) + ")");
        g.addColorStop(1, "rgba(255,178,92,0)");
        ctx.fillStyle = g;
        ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
      }
      ctx.restore();
    }

    drawHud(ctx) {
      const icons = window.Assets.img.icons;
      ctx.fillStyle = "#15111d";
      ctx.fillRect(0, 0, W, HUD);
      ctx.fillStyle = "rgba(198,150,74,0.35)";
      ctx.fillRect(0, HUD - 1, W, 1);

      for (let i = 0; i < HEARTS; i++) {
        ctx.drawImage(icons, (i < this.hearts ? 0 : 32), 0, 32, 32, 8 + i * 24, 2, 24, 24);
      }
      ctx.drawImage(icons, 64, 0, 32, 32, 96, 3, 22, 22);
      text(ctx, this.boxed + " / " + this.total, 124, HUD / 2 + 1, 16, "#e8dcc4");

      const secs = Math.floor(this.elapsed);
      text(ctx, "martellate " + this.hammers + "   ·   " + secs + "s", W / 2, HUD / 2 + 1,
        14, "rgba(200,190,210,0.7)", "center");
      text(ctx, "Stanza " + (this.index + 1) + " — " + this.arena.name, W - 10, HUD / 2 + 1,
        15, "rgba(226,200,150,0.85)", "right", SERIF);

      if (this.portalOpen && this.state === "play") {
        // in fondo allo schermo, su una fascia scura: leggibile sopra la pietra
        ctx.save();
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(this.time * 4);
        ctx.fillStyle = "rgba(14,11,20,0.72)";
        ctx.fillRect(0, H - 40, W, 32);
        text(ctx, "il portale è aperto — attraversalo", W / 2, H - 24, 18, "#d8c0ff", "center", SERIF);
        ctx.restore();
      }
    }

    panel(ctx, y, h) {
      ctx.fillStyle = "rgba(14,11,20,0.88)";
      ctx.fillRect(0, y, W, h);
      ctx.fillStyle = "rgba(198,150,74,0.4)";
      ctx.fillRect(0, y, W, 1);
      ctx.fillRect(0, y + h - 1, W, 1);
    }

    drawCard(ctx) {
      this.panel(ctx, 170, 190);
      text(ctx, "Stanza " + (this.index + 1), W / 2, 208, 18, "rgba(150,240,122,0.9)", "center");
      text(ctx, this.arena.name, W / 2, 250, 38, "#f0d9a8", "center", SERIF);
      text(ctx, this.arena.hint, W / 2, 302, 17, "rgba(210,204,220,0.85)", "center");
      text(ctx, "spiritelli da inscatolare: " + this.total, W / 2, 336, 16,
        "rgba(150,240,122,0.85)", "center");
    }

    drawDead(ctx) {
      this.panel(ctx, 210, 120);
      text(ctx, "Gli spiritelli hanno avuto la meglio", W / 2, 250, 30, "#f0d9a8", "center", SERIF);
      text(ctx, "si ricomincia la stanza…", W / 2, 292, 17, "rgba(210,204,220,0.8)", "center");
    }

    drawFinale(ctx) {
      ctx.fillStyle = "rgba(12,10,18,0.9)";
      ctx.fillRect(0, 0, W, H);
      text(ctx, "Tutti inscatolati", W / 2, 160, 46, "#f0d9a8", "center", SERIF);
      text(ctx, "Quattro stanze ripulite in " + Math.round(this.elapsed) + " secondi, con "
        + this.hammers + " martellate.", W / 2, 226, 20, "rgba(216,210,224,0.9)", "center");
      if (this.best > 0) {
        text(ctx, "Record: " + this.best + " secondi", W / 2, 262, 17,
          "rgba(150,240,122,0.9)", "center");
      }
      if (Math.floor(this.time * 2) % 2 === 0) {
        text(ctx, "INVIO per ricominciare", W / 2, 340, 19, "rgba(226,206,255,0.95)", "center");
      }
    }

    drawPause(ctx) {
      ctx.fillStyle = "rgba(12,10,18,0.74)";
      ctx.fillRect(0, 0, W, H);
      text(ctx, "Pausa", W / 2, 244, 42, "#f0d9a8", "center", SERIF);
      text(ctx, "P per riprendere · R per ricominciare la stanza", W / 2, 296, 17,
        "rgba(210,204,220,0.85)", "center");
    }

    drawTitle(ctx) {
      const img = window.Assets.img;
      ctx.fillStyle = "#191320";
      ctx.fillRect(0, 0, W, H);

      // pavimento di fondo, appena illuminato
      const tiles = img.tiles;
      for (let y = 0; y < H; y += TILE) {
        for (let x = 0; x < W; x += TILE) {
          const v = ((x / TILE) * 5 + (y / TILE) * 11) % 4;
          ctx.drawImage(tiles, v * TILE, 2 * TILE, TILE, TILE, x, y, TILE, TILE);
        }
      }
      ctx.fillStyle = "rgba(12,10,20,0.72)";
      ctx.fillRect(0, 0, W, H);

      ctx.drawImage(img.logo, (W - img.logo.width) / 2, 46);

      // il nano martella, uno spiritello rimbalza
      const t = this.time;
      const beat = t % 1.6;
      const frame = beat < 0.7 ? Math.min(3, Math.floor(beat / 0.175)) : 0;
      const row = beat < 0.7 ? 4 : 1;
      ctx.drawImage(img.dwarf, frame * 64, row * 64, 64, 64, 300, 300, 64, 64);
      const impX = 400 + (beat < 0.7 ? 0 : Math.min(70, (beat - 0.7) * 150));
      const impY = 316 - Math.sin(Math.min(1, (beat - 0.7) / 0.6) * Math.PI) * 26;
      ctx.drawImage(img.imps, (Math.floor(t * 6) % 4) * 48, (beat < 0.7 ? 0 : 48), 48, 48,
        impX, impY, 48, 48);
      ctx.drawImage(img.machine, 0, 0, 128, 128, 560, 268, 128, 128);

      if (Math.floor(t * 2) % 2 === 0) {
        text(ctx, "PREMI INVIO PER COMINCIARE", W / 2, 420, 22, "#f0d9a8", "center");
      }
      text(ctx, "frecce o WASD per muoverti · SPAZIO per martellare: stordisce e rinnova il torpore",
        W / 2, 464, 16, "rgba(196,190,210,0.8)", "center");
      text(ctx, "P pausa · R ricomincia la stanza · M audio",
        W / 2, 490, 16, "rgba(160,154,180,0.75)", "center");
      if (this.best > 0) {
        text(ctx, "Record: " + this.best + " secondi", W / 2, 518, 16,
          "rgba(150,240,122,0.85)", "center");
      }
    }
  }

  Game.WIDTH = W;
  Game.HEIGHT = H;
  Game.HUD = HUD;
  window.Game = Game;
})();
