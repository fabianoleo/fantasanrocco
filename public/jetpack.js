/* ===================================================================
   FantaSanRocco — «San Rocco Jetpack» (stile Jetpack Joyride, pixelato)
   Tieni premuto (tap / click / SPAZIO) per salire con la fiammata dorata,
   rilascia per scendere. Schiva i RAGGI DI FUOCO, raccogli le MONETE D'ORO.
   Ogni tanto compare l'AUREOLA: invincibilità a tempo.
   Più avanti si va, più è veloce (con un tetto: mai impossibile).
   Modulo autonomo, scoped .jp-* / #jpRoot. Record salvato in localStorage.
   =================================================================== */
(function () {
  const root = document.getElementById('jpRoot');
  if (!root) return;
  const canvas = document.getElementById('jpCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const W = 320, H = 200, GROUND = 184, CEIL = 6;
  canvas.width = W; canvas.height = H;

  const elScore = document.getElementById('jpScore');
  const elBest = document.getElementById('jpBest');
  const overlay = document.getElementById('jpOverlay');
  const ovTitle = document.getElementById('jpOverTitle');
  const ovDesc = document.getElementById('jpOverDesc');
  const ovHint = document.getElementById('jpHint');
  const ovKicker = document.getElementById('jpKicker');
  const playBtn = document.getElementById('jpPlay');
  const toast = document.getElementById('jpToast');
  const pauseBtn = document.getElementById('jpPauseBtn');
  const muteBtn = document.getElementById('jpMuteBtn');
  const pauseOverlay = document.getElementById('jpPause');
  const resumeBtn = document.getElementById('jpResume');
  const restartBtn = document.getElementById('jpRestart');
  const quitBtn = document.getElementById('jpQuit');

  const ARCADE = "'Press Start 2P', monospace";
  if (document.fonts && document.fonts.load) document.fonts.load("8px 'Press Start 2P'").catch(() => {});

  const BEST_KEY = 'fsr_jetpack_best';
  let best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
  if (elBest) elBest.textContent = 'record ' + best;

  // ── Stato ───────────────────────────────────────────────────────
  let state = 'idle';          // idle | run | over
  let py, vy, dist, score, coins, speed, thrust, inv;
  let zaps, items, pops, fxp, sparks;
  let spawnZ, spawnC, spawnHalo, animT, last, shake, overTimer;

  const GRAV = 0.34, THRUST = -0.62, VMAX = 5.2;
  const PX = 60;               // x fisso del santo
  const PW = 18, PH = 30;      // dimensioni sprite

  // ── Colonna sonora: come «Corri San Rocco» — interrompe la radio e suona la canzone ──
  let gameSong = null, radioWasOn = false, songMuted = false;
  const ensureSong = () => {
    if (gameSong) return gameSong;
    try {
      gameSong = new Audio('/audio/corri-san-rocco.mp3');
      gameSong.loop = true; gameSong.preload = 'auto'; gameSong.volume = 0.65;
      gameSong.muted = songMuted;
    } catch (e) { gameSong = null; }
    return gameSong;
  };
  const songPlay = () => {
    const R = window.FSRRadio;
    if (R && R.isPlaying && R.isPlaying()) { radioWasOn = true; R.pause(); }
    const s = ensureSong();
    if (s) { try { s.currentTime = 0; } catch (e) {} s.play().catch(() => {}); }
  };
  const songResume = () => { const s = ensureSong(); if (s) s.play().catch(() => {}); };
  const songPause = () => { if (gameSong) gameSong.pause(); };
  const songStop = () => {
    if (gameSong) { gameSong.pause(); try { gameSong.currentTime = 0; } catch (e) {} }
    if (radioWasOn && window.FSRRadio && window.FSRRadio.resume) window.FSRRadio.resume();
    radioWasOn = false;
  };
  function applyMute() {
    if (gameSong) gameSong.muted = songMuted;
    if (muteBtn) {
      muteBtn.classList.toggle('is-muted', songMuted);
      muteBtn.setAttribute('aria-pressed', songMuted ? 'true' : 'false');
      muteBtn.title = songMuted ? 'Riattiva audio' : 'Muta la canzone';
    }
  }
  function setPauseBtn() { if (pauseBtn) pauseBtn.classList.toggle('is-on', state === 'run'); }

  // ── Input ───────────────────────────────────────────────────────
  const setThrust = (on) => { thrust = on; };
  const onDown = (e) => {
    if (e.cancelable) e.preventDefault();
    if (state === 'idle' || state === 'over') { start(); return; }
    if (state === 'paused') return;              // in pausa il tocco non spinge
    setThrust(true);
  };
  const onUp = (e) => { if (e && e.cancelable) e.preventDefault(); setThrust(false); };

  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  if (playBtn) playBtn.addEventListener('click', (e) => { e.preventDefault(); start(); });
  window.addEventListener('keydown', (e) => {
    if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.code === 'KeyP' || e.code === 'Escape') {   // pausa / riprendi
      if (state === 'run') { e.preventDefault(); pause(); }
      else if (state === 'paused') { e.preventDefault(); resume(); }
      return;
    }
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (state === 'idle' || state === 'over') start();
      else if (state === 'run') setThrust(true);
    }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'ArrowUp') setThrust(false); });

  // Bottoni pausa / muta / overlay pausa
  if (pauseBtn) pauseBtn.addEventListener('click', (e) => { e.preventDefault(); if (state === 'run') pause(); });
  if (resumeBtn) resumeBtn.addEventListener('click', (e) => { e.preventDefault(); resume(); });
  if (restartBtn) restartBtn.addEventListener('click', (e) => { e.preventDefault(); start(); });
  if (quitBtn) quitBtn.addEventListener('click', (e) => { e.preventDefault(); quitToMenu(); });
  if (muteBtn) muteBtn.addEventListener('click', (e) => { e.preventDefault(); songMuted = !songMuted; applyMute(); });
  // Auto-pausa se la scheda passa in secondo piano
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'run') pause(); });

  // ── Disegno pixel ───────────────────────────────────────────────
  function r(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }
  function disc(cx, cy, rad, c) { ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fillStyle = c; ctx.fill(); }

  // San Rocco (adattato dal runner) — flying=true disegna la fiammata sotto i piedi
  function drawSaint(x, y, flying, shielded, t) {
    if (shielded) {
      ctx.save();
      ctx.shadowColor = 'rgba(243,198,75,.9)'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.ellipse(x + 9, y + 1, 8, 3, 0, 0, 7);
      ctx.strokeStyle = '#f5c842'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
    }
    // fiammata jetpack (fuochi dorati sotto i piedi)
    if (flying) {
      const f = (Math.floor(t / 3) % 2);
      ctx.save();
      ctx.shadowColor = 'rgba(255,150,60,.9)'; ctx.shadowBlur = 8;
      r(x + 5, y + 30, 3, 5 + f * 2, '#ff8a1e');
      r(x + 10, y + 30, 3, 6 - f, '#ff8a1e');
      r(x + 6, y + 30, 1, 8 + f, '#f5c842');
      r(x + 11, y + 30, 1, 7, '#f5c842');
      r(x + 7, y + 33, 4, 2, '#fff2b0');
      ctx.restore();
    }
    // bastone del pellegrino
    r(x + 16, y + 6, 2, 26, '#7a5a2e');
    r(x + 15, y + 5, 4, 3, '#caa24a');
    // gambe
    r(x + 5, y + 26, 3, 6, '#3a2c18');
    r(x + 10, y + 26, 3, 6, '#3a2c18');
    // tunica
    r(x + 4, y + 13, 10, 14, '#9a6b3b');
    r(x + 4, y + 13, 10, 3, '#b07d44');
    // conchiglia/segno rosso
    r(x + 8, y + 16, 2, 5, '#c0392b');
    r(x + 7, y + 17, 4, 2, '#c0392b');
    r(x + 12, y + 15, 3, 8, '#9a6b3b');
    // volto
    r(x + 7, y + 8, 5, 5, '#e8c49a');
    r(x + 7, y + 11, 5, 2, '#d9d2c2');
    // cappello
    r(x + 4, y + 6, 11, 2, '#5a4326');
    r(x + 6, y + 2, 7, 4, '#6b4f2c');
  }

  function drawCoin(o, t) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const glow = (Math.floor(t / 8) % 2);
    disc(cx, cy, o.w / 2 + (glow ? 0.4 : 0), '#b8860b');
    disc(cx, cy, o.w / 2 - 1.5, '#f5c842');
    r(cx - 1, cy - o.h / 2 + 2, 1, o.h - 4, '#fff7d0');
  }

  function drawHalo(o, t) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(243,198,75,.9)'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(cx, cy, o.w / 2, 0, 7); ctx.strokeStyle = '#f5c842'; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, o.w / 2 - 3, 0, 7); ctx.strokeStyle = 'rgba(245,200,66,.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  // Raggio di fuoco (zapper). Orientamento 'h' o 'v', con testine luminose.
  function drawZap(z, t) {
    const on = (Math.floor(t / 4) % 2);
    ctx.save();
    ctx.shadowColor = 'rgba(255,90,50,.9)'; ctx.shadowBlur = on ? 9 : 5;
    // corpo del raggio
    r(z.x, z.y, z.w, z.h, on ? '#ff5a3c' : '#e84e1b');
    if (z.w > z.h) {           // orizzontale — nucleo chiaro
      r(z.x, z.y + z.h / 2 - 1, z.w, 2, '#ffd08a');
    } else {                   // verticale
      r(z.x + z.w / 2 - 1, z.y, 2, z.h, '#ffd08a');
    }
    // emettitori alle estremità
    ctx.shadowBlur = 10;
    const e = '#f5c842';
    if (z.w > z.h) {
      r(z.x - 2, z.y - 2, 4, z.h + 4, e);
      r(z.x + z.w - 2, z.y - 2, 4, z.h + 4, e);
    } else {
      r(z.x - 2, z.y - 2, z.w + 4, 4, e);
      r(z.x - 2, z.y + z.h - 2, z.w + 4, 4, e);
    }
    ctx.restore();
  }

  function arcadeText(x, y, text, color, size, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.font = size + "px " + ARCADE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, size / 3);
    ctx.strokeStyle = 'rgba(0,0,0,.92)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ── Sfondo parallax ─────────────────────────────────────────────
  const stars = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * (GROUND - 50), s: Math.random() }));
  let bgX = 0;
  function drawBg(t) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, '#0a0a1e'); g.addColorStop(0.6, '#10101f'); g.addColorStop(1, '#181226');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    stars.forEach((s) => { if ((Math.sin(t / 30 + s.x) + 1) / 2 > 0.35 - s.s * 0.2) r(s.x, s.y, 1, 1, 'rgba(255,250,220,.8)'); });
    // skyline + campanile che scorre
    const off = (bgX * 0.4) % 120;
    for (let i = -1; i < 4; i++) {
      const bx = i * 120 - off + 10;
      r(bx, GROUND - 46, 14, 46, '#0d0b1a');
      r(bx + 40, GROUND - 34, 20, 34, '#0d0b1a');
      // campanile
      r(bx + 78, GROUND - 60, 12, 60, '#0d0b1a');
      r(bx + 80, GROUND - 68, 8, 10, '#0d0b1a');
      r(bx + 82, GROUND - 74, 4, 8, '#0d0b1a');
      r(bx + 82, GROUND - 52, 4, 4, 'rgba(245,200,66,.35)');
    }
    // soffitto e pavimento (metallici)
    r(0, 0, W, CEIL, '#241b0e'); r(0, CEIL, W, 1, '#6b4a25');
    r(0, GROUND, W, H - GROUND, '#241b0e'); r(0, GROUND, W, 2, '#6b4a25');
    for (let x = -(bgX % 16); x < W; x += 16) { r(x, GROUND + 3, 8, 1, '#3a2f1a'); r(x, 2, 8, 1, '#3a2f1a'); }
  }

  // ── Popup punteggio & particelle ────────────────────────────────
  function popup(x, y, text, color) { pops.push({ x, y, text, color, life: 46 }); }
  function burst(x, y, color, n) { for (let i = 0; i < n; i++) sparks.push({ x, y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3 - 1, life: 20 + Math.random() * 14, c: color }); }

  // ── Setup / start ───────────────────────────────────────────────
  function reset() {
    py = GROUND - PH - 20; vy = 0; dist = 0; score = 0; coins = 0;
    speed = 1.7; thrust = false; inv = 0;
    zaps = []; items = []; pops = []; fxp = []; sparks = [];
    spawnZ = 40; spawnC = 70; spawnHalo = 900 + Math.random() * 600;
    animT = 0; shake = 0;
    if (elScore) elScore.textContent = '0 m';
  }

  function start() {
    if (overTimer) { clearTimeout(overTimer); overTimer = null; }
    reset();
    state = 'run';
    overlay.classList.add('jp-hidden');
    if (pauseOverlay) pauseOverlay.classList.add('jp-hidden');
    setPauseBtn();
    songPlay();
  }

  // ── Pausa ───────────────────────────────────────────────────────
  function pause() {
    if (state !== 'run') return;
    state = 'paused'; thrust = false;
    if (pauseOverlay) pauseOverlay.classList.remove('jp-hidden');
    setPauseBtn();
    songPause();
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'run'; last = 0;                      // last=0 → dt=0 al primo frame (niente salti)
    if (pauseOverlay) pauseOverlay.classList.add('jp-hidden');
    setPauseBtn();
    songResume();
  }
  function quitToMenu() {
    if (overTimer) { clearTimeout(overTimer); overTimer = null; }
    if (pauseOverlay) pauseOverlay.classList.add('jp-hidden');
    reset();
    state = 'idle';
    setPauseBtn();
    songStop();
    showIdleOverlay();
  }

  function gameOver() {
    state = 'over';
    setPauseBtn();
    songStop();
    shake = 14;
    burst(PX + PW / 2, py + PH / 2, '#ff5a3c', 22);
    const total = Math.floor(score);
    if (total > best) { best = total; localStorage.setItem(BEST_KEY, String(best)); if (elBest) elBest.textContent = 'record ' + best; }
    overTimer = setTimeout(() => {
      overlay.classList.remove('jp-hidden');
      if (ovKicker) ovKicker.textContent = 'Game over';
      ovTitle.textContent = 'Riprova?';
      ovDesc.innerHTML = 'Distanza: <b>' + total + ' m</b> · Monete: <b>' + coins + '</b>' + (total >= best ? ' · nuovo record!' : '');
      ovHint.innerHTML = 'Tieni premuto <kbd>SPAZIO</kbd> o tocca per volare';
      if (playBtn) playBtn.textContent = 'Riprova';
    }, 700);
  }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg; toast.classList.add('jp-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('jp-toast-show'), 900);
  }

  // ── Spawner ─────────────────────────────────────────────────────
  function spawnZap() {
    const vertical = Math.random() < 0.5;
    if (vertical) {
      const h = 34 + Math.random() * 46;
      const fromTop = Math.random() < 0.5;
      const y = fromTop ? CEIL + 1 : GROUND - h;
      zaps.push({ x: W + 4, y, w: 6, h });
    } else {
      const w = 40 + Math.random() * 40;
      const y = CEIL + 14 + Math.random() * (GROUND - CEIL - 40);
      zaps.push({ x: W + 4, y, w, h: 6 });
    }
  }
  function spawnCoins() {
    const n = 4 + Math.floor(Math.random() * 4);
    const baseY = CEIL + 18 + Math.random() * (GROUND - CEIL - 60);
    const arc = Math.random() < 0.5;
    for (let i = 0; i < n; i++) {
      const y = arc ? baseY - Math.sin(i / (n - 1) * Math.PI) * 26 : baseY;
      items.push({ kind: 'coin', x: W + 6 + i * 14, y, w: 8, h: 8 });
    }
  }

  // ── Collisioni ──────────────────────────────────────────────────
  function hit(ax, ay, aw, ah, b) { return ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y; }

  // ── Loop ────────────────────────────────────────────────────────
  function frame(ts) {
    const dt = Math.min(2.5, (ts - (last || ts)) / 16.67); last = ts;
    animT++;
    if (state === 'run') update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function update(dt) {
    // velocità cresce con la distanza, con tetto
    speed = Math.min(4.3, 1.7 + dist / 900);
    bgX += speed * dt;
    dist += speed * dt * 0.35;
    score = dist;
    if (elScore) elScore.textContent = Math.floor(dist) + ' m';

    // fisica del santo
    vy += (thrust ? THRUST : GRAV) * dt;
    vy = Math.max(-VMAX, Math.min(VMAX, vy));
    py += vy * dt;
    if (thrust && animT % 2 === 0) burst(PX + 8, py + PH, '#ff8a1e', 1);

    // pavimento / soffitto
    const top = CEIL + 1, bot = GROUND - PH;
    if (py < top) { py = top; vy = 0; }
    if (py > bot) { py = bot; vy = 0; }

    if (inv > 0) inv -= dt;

    // spawn
    spawnZ -= speed * dt;
    if (spawnZ <= 0) { spawnZap(); spawnZ = 55 + Math.random() * 55 - Math.min(28, dist / 40); spawnZ = Math.max(24, spawnZ); }
    spawnC -= speed * dt;
    if (spawnC <= 0) { spawnCoins(); spawnC = 80 + Math.random() * 70; }
    spawnHalo -= speed * dt;
    if (spawnHalo <= 0) { items.push({ kind: 'halo', x: W + 6, y: CEIL + 20 + Math.random() * (GROUND - CEIL - 60), w: 12, h: 12 }); spawnHalo = 1200 + Math.random() * 800; }

    // muovi zapper
    const hbx = PX + 4, hby = py + 4, hbw = PW - 8, hbh = PH - 8;
    for (let i = zaps.length - 1; i >= 0; i--) {
      zaps[i].x -= speed * dt;
      if (zaps[i].x + zaps[i].w < -4) { zaps.splice(i, 1); continue; }
      if (inv <= 0 && hit(hbx, hby, hbw, hbh, zaps[i])) { gameOver(); return; }
    }
    // muovi item
    for (let i = items.length - 1; i >= 0; i--) {
      const o = items[i]; o.x -= speed * dt;
      if (o.x + o.w < -4) { items.splice(i, 1); continue; }
      if (hit(hbx, hby, hbw, hbh, o)) {
        if (o.kind === 'coin') { coins++; score += 3; popup(o.x, o.y - 4, '+3', '#f5c842'); burst(o.x + 4, o.y + 4, '#f5c842', 5); }
        else if (o.kind === 'halo') { inv = 320; showToast('AUREOLA!'); popup(o.x, o.y - 6, 'AUREOLA', '#f5c842'); burst(o.x + 6, o.y + 6, '#fff2b0', 12); }
        items.splice(i, 1);
      }
    }

    // particelle & popup
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 0.12 * dt; s.life -= dt;
      if (s.life <= 0) sparks.splice(i, 1);
    }
    for (let i = pops.length - 1; i >= 0; i--) { pops[i].y -= 0.5 * dt; pops[i].life -= dt; if (pops[i].life <= 0) pops.splice(i, 1); }
    if (shake > 0) shake -= dt;
  }

  function render() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    ctx.clearRect(-16, -16, W + 32, H + 32);
    drawBg(animT);

    // item
    items.forEach((o) => { if (o.kind === 'coin') drawCoin(o, animT); else drawHalo(o, animT); });
    // zapper
    zaps.forEach((z) => drawZap(z, animT));

    // santo (lampeggia se invincibile)
    const flick = inv > 0 && (Math.floor(animT / 4) % 2);
    if (!flick) drawSaint(PX, py, state === 'run' && thrust, inv > 0, animT);

    // particelle
    sparks.forEach((s) => r(s.x, s.y, 2, 2, s.c));
    // popup
    pops.forEach((p) => arcadeText(p.x, p.y, p.text, p.color, 8, Math.max(0, Math.min(1, p.life / 30))));

    // messaggio iniziale
    if (state === 'idle') arcadeText(W / 2, 70, 'PREMI PER VOLARE', '#f5c842', 10, 0.9);

    ctx.restore();
  }

  // ── Overlay iniziale ────────────────────────────────────────────
  function showIdleOverlay() {
    overlay.classList.remove('jp-hidden');
    if (ovKicker) ovKicker.textContent = 'Insert coin';
    ovTitle.textContent = 'San Rocco Jetpack';
    ovDesc.innerHTML = 'Vola con la fiammata, schiva i raggi di fuoco, raccogli le monete';
    ovHint.innerHTML = 'Tieni premuto <kbd>SPAZIO</kbd> o tocca per salire';
    if (playBtn) playBtn.textContent = 'Gioca';
  }
  reset();
  setPauseBtn();
  applyMute();
  showIdleOverlay();
  requestAnimationFrame(frame);
})();
