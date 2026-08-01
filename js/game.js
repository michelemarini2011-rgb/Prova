/* Regia: stati, onda d'urto, consegna al macchinario, portale, interfaccia. */
(function () {
  "use strict";

  const TILE = window.Arena.TILE;
  const W = 960;
  const HUD = 28;
  const H = HUD + window.Arena.ROWS * TILE;      // 28 + 512 = 540

  const SERIF = 'Georgia, "Palatino Linotype", "Times New Roman", serif';
  const SANS = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

  const GRAB_DIST = 34;
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

  /** Testo con contorno: leggibile sia sul cielo sia sull'erba. */
  function outlined(ctx, str, x, y, size, color, align, font) {
    ctx.save();
    ctx.font = size + "px " + (font || SANS);
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(3, size * 0.18);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(74,42,22,0.85)";
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  class Game {
    constructor(canvas, input) {
      canvas.width = W;
      canvas.height = H;
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.input = input;

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
    onJump() { window.Sfx.jump(); }

    onLand(dwarf) {
      window.Sfx.land();
      for (let i = 0; i < 5; i++) {
        this.particles.push({
          x: dwarf.cx + (Math.random() - 0.5) * 18, y: dwarf.feet,
          vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 50,
          life: 0.35, max: 0.35, size: 2.4, color: "214,166,116"
        });
      }
    }

    /** Il martello tocca terra: onda d'urto che sbalza e stordisce. */
    onHammer(point) {
      this.hammers += 1;
      this.waves.push({ x: point.x, y: point.y, t: 0, max: 0.36 });
      window.Sfx.hammer();
      this.dust(point.x, point.y, 14);

      // chi è al traino non viene sbalzato, ma il colpo gli rinnova il torpore
      const carried = this.dwarf.carrying;
      if (carried && !carried.boxed) {
        carried.stun = this.arena.stun;
        this.burst(carried.x, carried.y, "255,226,90", 8, 110);
      }
      let hit = 0;
      for (const imp of this.imps) {
        if (imp.boxed || imp.state === "carried") continue;
        // distanza normalizzata sull'ellisse: l'onda corre a terra e sale un po'
        const k = Math.hypot((imp.x - point.x) / window.Dwarf.SHOCK_RX,
                             (imp.y - point.y) / window.Dwarf.SHOCK_RY);
        if (k > 1) continue;
        const power = 300 * (1 - k) + 170;
        imp.shock(point.x, point.y, power, this.arena.stun);
        hit += 1;
        this.burst(imp.x, imp.y, "255,226,90", 10, 150);
      }
      if (hit > 0) window.Sfx.stun();
    }

    dust(x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = -Math.random() * Math.PI;
        const v = 70 + Math.random() * 150;
        this.particles.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6,
          life: 0.45, max: 0.45, size: 2 + Math.random() * 2.4, color: "222,182,128"
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

      this.checkCarry();
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
        if (this.portalT >= 1 && Math.abs(dwarf.cx - p.x) < 30 && Math.abs(dwarf.feet - p.y) < 60) {
          window.Sfx.enterPortal();
          this.setState("clear", 1.0);
        }
      }
    }

    checkCarry() {
      const dwarf = this.dwarf;
      const carried = dwarf.carrying;
      if (carried) {
        if (carried.stun <= 0) {                 // si è svegliato mentre lo trascinavi
          carried.breakFree(dwarf);
          dwarf.carrying = null;
          dwarf.hurt(carried.x);                 // spintone, ma nessun cuore perso
          window.Sfx.free();
        }
        return;
      }
      for (const imp of this.imps) {
        if (imp.boxed || imp.state !== "stunned") continue;
        if (Math.abs(imp.x - dwarf.cx) > GRAB_DIST) continue;
        if (Math.abs(imp.y - (dwarf.feet - 12)) > 34) continue;
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
        const nx = Math.max(dwarf.x, Math.min(imp.x, dwarf.x + dwarf.w));
        const ny = Math.max(dwarf.y, Math.min(imp.y, dwarf.y + dwarf.h));
        if (Math.hypot(imp.x - nx, imp.y - ny) > imp.r) continue;
        if (!dwarf.hurt(imp.x)) continue;
        this.hearts -= 1;
        window.Sfx.hurt();
        this.burst(dwarf.cx, dwarf.cy, "255,85,102", 12, 160);
        imp.vx = (imp.x < dwarf.cx ? -1 : 1) * imp.speed * 2;
        imp.vy = -160;
        if (this.hearts <= 0) this.lose();
        return;
      }
    }

    checkMachine() {
      const dwarf = this.dwarf;
      const imp = dwarf.carrying;
      if (!imp) return;
      const gate = this.arena.machine.intake;
      if (Math.hypot(dwarf.cx - gate.x, dwarf.cy - gate.y) > gate.r) return;
      imp.boxed = true;
      imp.state = "boxed";
      dwarf.carrying = null;
      this.boxed += 1;
      this.arena.machine.crates += 1;
      this.arena.machine.anim = 0.9;
      window.Sfx.box();
      this.burst(gate.x, gate.y, "186,244,255", 16, 170);
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
        q.vy += 320 * dt;
        q.vx *= 0.96;
      }
    }

    // -------------------------------------------------------------- disegno
    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, W, H);
      if (this.state === "title") { this.drawTitle(ctx); return; }

      ctx.save();
      ctx.translate(0, HUD);
      this.arena.drawScene(ctx);
      this.drawPortal(ctx);
      this.arena.drawMachine(ctx, this.time);
      for (const imp of this.imps) if (!imp.boxed) imp.draw(ctx, this.time);
      if (this.state !== "dead") this.dwarf.draw(ctx);
      this.drawWaves(ctx);
      this.drawParticles(ctx);
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
        const r = window.Dwarf.SHOCK_RX * (0.25 + t * 0.95);
        ctx.save();
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 5 * (1 - t) + 1.5;
        ctx.beginPath();
        ctx.ellipse(w.x, w.y, r, r * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,193,77,0.9)";
        ctx.lineWidth = 3 * (1 - t) + 1;
        ctx.beginPath();
        ctx.ellipse(w.x, w.y, r * 0.7, r * 0.3, 0, 0, Math.PI * 2);
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
      ctx.translate(p.x, p.y - 64);
      ctx.scale(k, k);
      ctx.drawImage(img, frame * 96, 0, 96, 128, -48, -64, 96, 128);
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

    drawHud(ctx) {
      const icons = window.Assets.img.icons;
      ctx.fillStyle = "#5a3a20";
      ctx.fillRect(0, 0, W, HUD);
      ctx.fillStyle = "rgba(255,226,150,0.5)";
      ctx.fillRect(0, HUD - 2, W, 2);

      for (let i = 0; i < HEARTS; i++) {
        ctx.drawImage(icons, (i < this.hearts ? 0 : 32), 0, 32, 32, 8 + i * 24, 2, 24, 24);
      }
      ctx.drawImage(icons, 64, 0, 32, 32, 96, 3, 22, 22);
      text(ctx, this.boxed + " / " + this.total, 124, HUD / 2 + 1, 16, "#ffe89b");
      text(ctx, "martellate " + this.hammers + "   ·   " + Math.floor(this.elapsed) + "s",
        W / 2, HUD / 2 + 1, 14, "rgba(255,240,214,0.8)", "center");
      text(ctx, "Cava " + (this.index + 1) + " — " + this.arena.name, W - 10, HUD / 2 + 1,
        15, "#ffe89b", "right", SERIF);

      if (this.portalOpen && this.state === "play") {
        ctx.save();
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 4);
        outlined(ctx, "il portale è aperto — attraversalo", W / 2, H - 26, 20, "#fff5cf", "center", SERIF);
        ctx.restore();
      }
    }

    panel(ctx, y, h) {
      ctx.fillStyle = "rgba(92,52,26,0.9)";
      ctx.fillRect(0, y, W, h);
      ctx.fillStyle = "rgba(255,226,150,0.7)";
      ctx.fillRect(0, y, W, 2);
      ctx.fillRect(0, y + h - 2, W, 2);
    }

    drawCard(ctx) {
      this.panel(ctx, 170, 190);
      text(ctx, "Cava " + (this.index + 1), W / 2, 208, 18, "#b6f0a0", "center");
      text(ctx, this.arena.name, W / 2, 250, 38, "#ffe89b", "center", SERIF);
      text(ctx, this.arena.hint, W / 2, 302, 17, "rgba(255,246,226,0.92)", "center");
      text(ctx, "spiritelli da inscatolare: " + this.total, W / 2, 336, 16, "#b6f0a0", "center");
    }

    drawDead(ctx) {
      this.panel(ctx, 210, 120);
      text(ctx, "Gli spiritelli hanno avuto la meglio", W / 2, 250, 30, "#ffe89b", "center", SERIF);
      text(ctx, "si ricomincia la cava…", W / 2, 292, 17, "rgba(255,246,226,0.9)", "center");
    }

    drawFinale(ctx) {
      ctx.drawImage(window.Assets.img.backdrop, 0, 0, W, H);
      ctx.fillStyle = "rgba(92,52,26,0.72)";
      ctx.fillRect(0, 0, W, H);
      outlined(ctx, "Tutti inscatolati", W / 2, 160, 46, "#ffe89b", "center", SERIF);
      text(ctx, "Quattro cave ripulite in " + Math.round(this.elapsed) + " secondi, con "
        + this.hammers + " martellate.", W / 2, 226, 20, "#fff6e2", "center");
      if (this.best > 0) {
        text(ctx, "Record: " + this.best + " secondi", W / 2, 262, 17, "#b6f0a0", "center");
      }
      if (Math.floor(this.time * 2) % 2 === 0) {
        text(ctx, "INVIO per ricominciare", W / 2, 340, 19, "#fff5cf", "center");
      }
    }

    drawPause(ctx) {
      ctx.fillStyle = "rgba(92,52,26,0.72)";
      ctx.fillRect(0, 0, W, H);
      outlined(ctx, "Pausa", W / 2, 244, 42, "#ffe89b", "center", SERIF);
      text(ctx, "P per riprendere · R per ricominciare la cava", W / 2, 296, 17,
        "#fff6e2", "center");
    }

    drawTitle(ctx) {
      const img = window.Assets.img;
      ctx.drawImage(img.backdrop, 0, 0, W, H);

      // una striscia di terreno in fondo
      const tiles = img.tiles;
      for (let x = 0; x < W; x += TILE) {
        const v = (x / TILE) % 2;
        const sy = (1 + v * 2) * TILE;
        ctx.drawImage(tiles, 6 * TILE, sy, TILE, TILE, x, H - TILE * 2, TILE, TILE);
        ctx.drawImage(tiles, 7 * TILE, sy, TILE, TILE, x, H - TILE, TILE, TILE);
      }

      ctx.drawImage(img.logo, (W - img.logo.width) / 2, 40);

      // il nano martella, lo spiritello rimbalza
      const t = this.time;
      const beat = t % 1.8;
      const hammering = beat < 0.7;
      const frame = hammering ? Math.min(3, Math.floor(beat / 0.175)) : Math.floor(t * 6) % 2;
      const row = hammering ? 2 : 0;
      const fx = 300;
      ctx.drawImage(img.dwarf, frame * 64, row * 64, 64, 64, fx, H - TILE * 2 - 58, 64, 64);
      const k = hammering ? 0 : Math.min(1, (beat - 0.7) / 0.7);
      const ix = fx + 70 + k * 90;
      const iy = H - TILE * 2 - 46 - Math.sin(k * Math.PI) * 60;
      ctx.drawImage(img.imps, (Math.floor(t * 6) % 4) * 48, (hammering ? 0 : 48), 48, 48, ix, iy, 48, 48);
      ctx.drawImage(img.machine, 0, 0, 128, 128, 640, H - TILE * 2 - 122, 128, 128);

      if (Math.floor(t * 2) % 2 === 0) {
        outlined(ctx, "PREMI INVIO PER COMINCIARE", W / 2, 252, 24, "#fff5cf", "center");
      }
      outlined(ctx, "← → corri · SPAZIO salta · X martella", W / 2, 292, 18, "#ffffff", "center");
      outlined(ctx, "P pausa · R ricomincia la cava · M audio", W / 2, 318, 16, "#f6e6cc", "center");
      if (this.best > 0) {
        outlined(ctx, "Record: " + this.best + " secondi", W / 2, 344, 17, "#d8ffc0", "center");
      }
    }
  }

  Game.WIDTH = W;
  Game.HEIGHT = H;
  Game.HUD = HUD;
  window.Game = Game;
})();
