/* Regia: stati, onda d'urto, consegna al macchinario, portale, interfaccia. */
(function () {
  "use strict";

  const TILE = window.Arena.TILE;
  const HUD = 28;
  const MAP_W = window.Arena.COLS * TILE;           // 960: larghezza del mondo
  const SCREEN_H = window.Arena.SCREEN_ROWS * TILE; // 512: uno schermo di altezza

  // La vista si adatta alla forma dello schermo: invece di rimpicciolire tutto
  // su un telefono in verticale, si mostra meno mondo alla stessa scala.
  const MIN_SCALE = 0.82;        // sotto questa scala il gioco è illeggibile
  const MIN_VIEW_W = 15 * TILE;  // non meno di 15 celle in larghezza
  const MIN_VIEW_H = 9 * TILE;   // non meno di 9 celle in altezza

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
      this.cam = { x: 0, y: 0 };
      this.vw = MAP_W;
      this.vh = SCREEN_H;
      this.resize(MAP_W, SCREEN_H);

      input.onAction = () => this.confirm();
      input.onKey = (key) => {
        if (key === "p" || key === "P") this.togglePause();
        if (key === "r" || key === "R") this.restart();
      };
    }

    /**
     * Sceglie quanta parte del mondo mostrare, dato lo spazio disponibile in
     * pixel CSS. Su schermi larghi si vede tutto; su un telefono in verticale
     * la vista si restringe e si allunga, mantenendo i personaggi leggibili.
     */
    resize(availW, availH) {
      this.boxW = availW;
      this.boxH = availH;
      const mapH = this.arena ? this.arena.h : Infinity;
      const aspect = availW / Math.max(1, availH);
      // altezza di vista che conserva la forma della scatola (HUD compreso)
      const heightFor = (w) => Math.round(w / aspect) - HUD;

      let vw = MAP_W;
      if (heightFor(vw) > mapH) vw = (mapH + HUD) * aspect;   // la mappa finisce prima
      if (availW / vw < MIN_SCALE) vw = availW / MIN_SCALE;   // altrimenti sarebbe minuscolo
      vw = Math.max(MIN_VIEW_W, Math.min(MAP_W, Math.round(vw)));
      const vh = Math.max(MIN_VIEW_H, Math.min(mapH, heightFor(vw)));

      this.vw = vw;
      this.vh = vh;
      this.canvas.width = vw;
      this.canvas.height = vh + HUD;
      this.ctx.imageSmoothingEnabled = true;
      if (this.dwarf) this.updateCamera(0, true);
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
      // piattaforme mobili e blocchi irti: l'arena tiene le prime perché anche
      // i blocchi devono potervi salire sopra
      this.arena.movers = this.arena.moverSpecs.map((s) =>
        new window.Movers.MovingPlatform(this.arena, s.tx, s.ty, s.tiles, s.speed));
      this.blocks = this.arena.blockSpawns.map((b) =>
        new window.Movers.Block(this.arena, b.tx, b.ty));
      this.total = this.imps.length;
      this.boxed = 0;
      this.hearts = HEARTS;
      this.waves.length = 0;
      this.particles.length = 0;
      this.portalOpen = false;
      this.portalT = 0;
      this.resize(this.boxW, this.boxH);
      this.updateCamera(0, true);
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
      // i blocchi irti si spostano solo così: a martellate, mai a mani nude
      for (const b of this.blocks) {
        const k = Math.hypot((b.cx - point.x) / window.Dwarf.SHOCK_RX,
                             (b.cy - point.y) / window.Dwarf.SHOCK_RY);
        if (k > 1) continue;
        b.push(point.x, 250 * (1 - k) + 120);
        this.dust(b.cx, b.y + b.h, 6);
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
      // prima le piattaforme: chi ci sta sopra si sposta con loro
      const movers = this.arena.movers;
      for (const m of movers) m.update(dt, movers);
      dwarf.update(dt, this.input, this);
      for (const b of this.blocks) b.update(dt, this.blocks);
      for (const imp of this.imps) if (!imp.boxed) imp.update(dt, dwarf);

      this.checkCarry();
      this.checkSpikes();
      if (this.state !== "play") return;
      this.checkContact();
      this.checkMachine();
      this.updateCamera(dt);
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

    /** La vista insegue il nano, restando dentro i bordi della mappa. */
    updateCamera(dt, snap) {
      const maxX = Math.max(0, this.arena.w - this.vw);
      const maxY = Math.max(0, this.arena.h - this.vh);
      const tx = Math.max(0, Math.min(maxX, this.dwarf.cx - this.vw * 0.5));
      const ty = Math.max(0, Math.min(maxY, this.dwarf.cy - this.vh * 0.55));
      const k = Math.min(1, dt * 5.5);
      this.cam.x = snap ? tx : this.cam.x + (tx - this.cam.x) * k;
      this.cam.y = snap ? ty : this.cam.y + (ty - this.cam.y) * k;
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

    /** Le punte non perdonano: un solo contatto e la cava ricomincia. */
    checkSpikes() {
      for (const b of this.blocks) {
        if (!b.touches(this.dwarf)) continue;
        this.hearts = 0;
        this.burst(this.dwarf.cx, this.dwarf.cy, "255,85,102", 20, 200);
        this.dust(b.cx, b.cy, 10);
        window.Sfx.hurt();
        this.lose("Le punte del blocco non perdonano");
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

    lose(reason) {
      window.Sfx.lose();
      this.deathMsg = reason || "Gli spiritelli hanno avuto la meglio";
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
      const W = this.vw, H = this.vh + HUD;
      ctx.clearRect(0, 0, W, H);
      if (this.state === "title") { this.drawTitle(ctx); return; }

      ctx.save();
      ctx.translate(0, HUD);
      this.drawBackdrop(ctx);                       // parallasse: non scorre con la mappa
      ctx.translate(-Math.round(this.cam.x), -Math.round(this.cam.y));
      this.arena.drawMap(ctx);
      for (const m of this.arena.movers) m.draw(ctx);
      this.drawPortal(ctx);
      this.arena.drawMachine(ctx, this.time);
      for (const b of this.blocks) b.draw(ctx);
      for (const imp of this.imps) if (!imp.boxed) imp.draw(ctx, this.time);
      if (this.state !== "dead") this.dwarf.draw(ctx);
      this.drawWaves(ctx);
      this.drawParticles(ctx);
      ctx.restore();

      this.drawMarkers(ctx);
      this.drawHud(ctx);
      if (this.state === "intro") this.drawCard(ctx);
      if (this.state === "dead") this.drawDead(ctx);
      if (this.state === "finale") this.drawFinale(ctx);
      if (this.paused) this.drawPause(ctx);
    }

    /** Il fondale scorre di poco: in cima resta cielo, in fondo l'orizzonte. */
    drawBackdrop(ctx) {
      const bd = window.Assets.img.backdrop;
      const maxX = Math.max(1, this.arena.w - this.vw);
      const maxY = Math.max(1, this.arena.h - this.vh);
      const tx = Math.max(0, Math.min(1, this.cam.x / maxX));
      const ty = Math.max(0, Math.min(1, this.cam.y / maxY));
      // ingrandito quanto basta a coprire la vista, qualunque sia la sua forma
      const sc = Math.max(this.vw / bd.width, this.vh / bd.height);
      const dw = bd.width * sc, dh = bd.height * sc;
      ctx.drawImage(bd, Math.round(-tx * Math.max(0, dw - this.vw)),
        Math.round(-ty * Math.max(0, dh - this.vh)), Math.ceil(dw), Math.ceil(dh));
    }

    /** Frecce ai bordi per quello che serve ma è fuori schermo. */
    drawMarkers(ctx) {
      if (this.state !== "play") return;
      const W = this.vw, VH = this.vh;
      const marks = [];
      if (this.dwarf.carrying) {
        const m = this.arena.machine.intake;
        marks.push({ x: m.x, y: m.y, color: "#3aa8b8", label: "macchinario" });
      }
      if (this.portalOpen && this.portalT >= 1) {
        const p = this.arena.portalSpot;
        marks.push({ x: p.x, y: p.y - 60, color: "#f0a830", label: "portale" });
      }
      for (const mk of marks) {
        const sx = mk.x - this.cam.x, sy = mk.y - this.cam.y;
        const outX = sx < 26 ? -1 : sx > W - 26 ? 1 : 0;
        const outY = sy < 26 ? -1 : sy > VH - 26 ? 1 : 0;
        if (!outX && !outY) continue;
        const px = Math.max(30, Math.min(W - 30, sx));
        const py = HUD + Math.max(30, Math.min(VH - 30, sy));
        const ang = Math.atan2(outY, outX);
        ctx.save();
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.time * 5);
        ctx.translate(px, py);
        ctx.rotate(ang);
        ctx.fillStyle = mk.color;
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-8, -11);
        ctx.lineTo(-8, 11);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
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
      const W = this.vw, H = this.vh + HUD;
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
      const secs = Math.floor(this.elapsed);
      if (W >= 640) {
        text(ctx, "martellate " + this.hammers + "   ·   " + secs + "s",
          W / 2, HUD / 2 + 1, 14, "rgba(255,240,214,0.8)", "center");
        text(ctx, "Cava " + (this.index + 1) + " — " + this.arena.name, W - 10, HUD / 2 + 1,
          15, "#ffe89b", "right", SERIF);
      } else {
        // vista stretta: solo l'essenziale, senza scritte che si accavallano
        text(ctx, "Cava " + (this.index + 1) + "  ·  " + secs + "s", W - 10, HUD / 2 + 1,
          14, "#ffe89b", "right", SERIF);
      }

      if (this.portalOpen && this.state === "play") {
        ctx.save();
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 4);
        const msg = W >= 560 ? "il portale è aperto — attraversalo" : "portale aperto";
        outlined(ctx, msg, W / 2, H - 26, Math.min(20, W / 22), "#fff5cf", "center", SERIF);
        ctx.restore();
      }
    }

    panel(ctx, y, h) {
      const W = this.vw;
      ctx.fillStyle = "rgba(92,52,26,0.9)";
      ctx.fillRect(0, y, W, h);
      ctx.fillStyle = "rgba(255,226,150,0.7)";
      ctx.fillRect(0, y, W, 2);
      ctx.fillRect(0, y + h - 2, W, 2);
    }

    drawCard(ctx) {
      const W = this.vw, cy = (this.vh + HUD) / 2;
      const big = Math.min(38, W / 22);
      this.panel(ctx, cy - 95, 190);
      text(ctx, "Cava " + (this.index + 1), W / 2, cy - 57, 18, "#b6f0a0", "center");
      text(ctx, this.arena.name, W / 2, cy - 15, big, "#ffe89b", "center", SERIF);
      this.wrapped(ctx, this.arena.hint, W / 2, cy + 37, W - 60, 17, "rgba(255,246,226,0.92)");
      text(ctx, "spiritelli da inscatolare: " + this.total, W / 2, cy + 71, 16, "#b6f0a0", "center");
    }

    /** Testo a capo automatico: i suggerimenti stanno anche su schermo stretto. */
    wrapped(ctx, str, x, y, maxW, size, color, outline) {
      ctx.font = size + "px " + SANS;
      const words = String(str).split(" ");
      const lines = [];
      let line = "";
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
        else line = test;
      }
      if (line) lines.push(line);
      const start = y - (lines.length - 1) * size * 0.7;
      const put = outline ? outlined : text;
      lines.forEach((l, i) => put(ctx, l, x, start + i * size * 1.35, size, color, "center"));
    }

    drawDead(ctx) {
      const W = this.vw, cy = (this.vh + HUD) / 2;
      this.panel(ctx, cy - 60, 120);
      this.wrapped(ctx, this.deathMsg || "Gli spiritelli hanno avuto la meglio", W / 2, cy - 15,
        W - 50, Math.min(30, W / 26), "#ffe89b");
      text(ctx, "si ricomincia la cava…", W / 2, cy + 27, 17, "rgba(255,246,226,0.9)", "center");
    }

    drawFinale(ctx) {
      const W = this.vw, H = this.vh + HUD, cy = H / 2;
      ctx.drawImage(window.Assets.img.backdrop, 0, 0, W, H);
      ctx.fillStyle = "rgba(92,52,26,0.72)";
      ctx.fillRect(0, 0, W, H);
      outlined(ctx, "Tutti inscatolati", W / 2, cy - 105, Math.min(46, W / 16), "#ffe89b", "center", SERIF);
      this.wrapped(ctx, "Quattro cave ripulite in " + Math.round(this.elapsed)
        + " secondi, con " + this.hammers + " martellate.", W / 2, cy - 40, W - 60, 20, "#fff6e2");
      if (this.best > 0) {
        text(ctx, "Record: " + this.best + " secondi", W / 2, cy + 5, 17, "#b6f0a0", "center");
      }
      if (Math.floor(this.time * 2) % 2 === 0) {
        text(ctx, "INVIO o tocca per ricominciare", W / 2, cy + 75, 19, "#fff5cf", "center");
      }
    }

    drawPause(ctx) {
      const W = this.vw, H = this.vh + HUD, cy = H / 2;
      ctx.fillStyle = "rgba(92,52,26,0.72)";
      ctx.fillRect(0, 0, W, H);
      outlined(ctx, "Pausa", W / 2, cy - 20, Math.min(42, W / 14), "#ffe89b", "center", SERIF);
      this.wrapped(ctx, "P per riprendere · R per ricominciare la cava", W / 2, cy + 32,
        W - 50, 17, "#fff6e2");
    }

    drawTitle(ctx) {
      const img = window.Assets.img;
      const W = this.vw, H = this.vh + HUD;
      const bd = img.backdrop;
      const sc = Math.max(W / bd.width, H / bd.height);
      ctx.drawImage(bd, 0, Math.round(H - bd.height * sc), Math.ceil(bd.width * sc),
        Math.ceil(bd.height * sc));

      // striscia di terreno in fondo
      const tiles = img.tiles;
      for (let x = 0; x < W; x += TILE) {
        const v = (x / TILE) % 2;
        const sy = (1 + v * 2) * TILE;
        ctx.drawImage(tiles, 6 * TILE, sy, TILE, TILE, x, H - TILE * 2, TILE, TILE);
        ctx.drawImage(tiles, 7 * TILE, sy, TILE, TILE, x, H - TILE, TILE, TILE);
      }

      const logoW = Math.min(img.logo.width, W - 30);
      const logoH = logoW * img.logo.height / img.logo.width;
      const logoY = Math.max(10, H * 0.06);
      ctx.drawImage(img.logo, (W - logoW) / 2, logoY, logoW, logoH);

      // il nano martella, lo spiritello rimbalza
      const t = this.time;
      const beat = t % 1.8;
      const hammering = beat < 0.7;
      const frame = hammering ? Math.min(3, Math.floor(beat / 0.175)) : Math.floor(t * 6) % 2;
      const fx = Math.max(20, W * 0.18);
      ctx.drawImage(img.dwarf, frame * 64, (hammering ? 2 : 0) * 64, 64, 64,
        fx, H - TILE * 2 - 58, 64, 64);
      const k = hammering ? 0 : Math.min(1, (beat - 0.7) / 0.7);
      ctx.drawImage(img.imps, (Math.floor(t * 6) % 4) * 48, (hammering ? 0 : 48), 48, 48,
        fx + 70 + k * 80, H - TILE * 2 - 46 - Math.sin(k * Math.PI) * 60, 48, 48);
      if (W > 620) {
        ctx.drawImage(img.machine, 0, 0, 128, 128, W - 200, H - TILE * 2 - 122, 128, 128);
      }

      let y = logoY + logoH + Math.max(24, H * 0.06);
      const pad = this.input && this.input.padActive;
      if (Math.floor(t * 2) % 2 === 0) {
        const touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        const invito = pad ? "PREMI A PER COMINCIARE"
          : touch ? "TOCCA PER COMINCIARE" : "PREMI INVIO PER COMINCIARE";
        outlined(ctx, invito, W / 2, y, Math.min(24, W / 17), "#fff5cf", "center");
      }
      y += 42;
      const touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      if (pad) {
        this.wrapped(ctx, "levetta o croce per correre · A salta · X martella",
          W / 2, y, W - 40, 17, "#ffffff", true);
        y += 32;
        this.wrapped(ctx, "START mette in pausa", W / 2, y, W - 40, 15, "#f6e6cc", true);
      } else if (touch) {
        this.wrapped(ctx, "frecce per correre · SALTA · MARTELLA",
          W / 2, y, W - 40, 17, "#ffffff", true);
      } else {
        this.wrapped(ctx, "← → corri · SPAZIO salta · X martella", W / 2, y, W - 40, 17, "#ffffff", true);
        y += 32;
        this.wrapped(ctx, "P pausa · R ricomincia la cava · M audio", W / 2, y, W - 40, 15, "#f6e6cc", true);
      }
      if (this.best > 0) {
        outlined(ctx, "Record: " + this.best + " secondi", W / 2, y + 32, 16, "#d8ffc0", "center");
      }
    }
  }

  Game.HUD = HUD;
  Game.MAP_W = MAP_W;
  window.Game = Game;
})();
