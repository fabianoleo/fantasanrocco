/* ===================================================================
   FantaSanRocco — «Corri San Rocco» (schiva-ostacoli pixelato)
   San Rocco e il cane si muovono in orizzontale in fondo; torce, bombe
   e fuochi cadono dall'alto: spostati per schivarli.
   Bonus: MONETE D'ORO (+punti) e AUREOLA (invincibilità a tempo).
   Messaggi stile arcade (VIA!, GAME OVER, +15, AUREOLA!).
   Più si va avanti più è difficile, con un tetto (mai impossibile).
   =================================================================== */
(function () {
  const root = document.getElementById('gmRoot');
  if (!root) return;
  const canvas = document.getElementById('gmCanvas');
  const ctx = canvas.getContext('2d');
  const W = 300, H = 200, GROUND = 178;
  canvas.width = W; canvas.height = H;

  const logged = root.dataset.logged === '1';
  const csrf = root.dataset.csrf || '';
  let best = parseInt(root.dataset.best, 10) || 0;

  const elScore = document.getElementById('gmScore');
  const elBest = document.getElementById('gmBest');
  const overlay = document.getElementById('gmOverlay');
  const ovTitle = document.getElementById('gmOverTitle');
  const ovScore = document.getElementById('gmOverScore');
  const ovHint = document.getElementById('gmHint');
  const toast = document.getElementById('gmToast');
  const flash = document.getElementById('gmFlash');
  elBest.textContent = 'record ' + best;

  const ARCADE = "'Press Start 2P', monospace";
  if (document.fonts && document.fonts.load) document.fonts.load("8px 'Press Start 2P'").catch(() => {});

  const PW = 18;
  // ── Stato ───────────────────────────────────────────────────────
  let state = 'idle';           // idle | run | over
  let px, target, dist, bonus, score, inv, mult, items, popups, fx, spawnT, coinT, haloT, relicT, fwT, animT, last, shake, reported, coinRain, coinRainT;
  let keyL = false, keyR = false, pointerX = null, overTimer = null, gameToken = null;

  // ── Colonna sonora: mentre giochi interrompe la radio e suona «Corri San Rocco» ──
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
    const R = window.FSRRadio;                               // metti in pausa la radio globale
    if (R && R.isPlaying && R.isPlaying()) { radioWasOn = true; R.pause(); }
    const s = ensureSong();
    if (s) { try { s.currentTime = 0; } catch (e) {} s.play().catch(() => {}); }
  };
  const songResume = () => { const s = ensureSong(); if (s) s.play().catch(() => {}); };
  const songPause = () => { if (gameSong) gameSong.pause(); };
  const songStop = () => {
    if (gameSong) { gameSong.pause(); try { gameSong.currentTime = 0; } catch (e) {} }
    if (radioWasOn && window.FSRRadio && window.FSRRadio.resume) window.FSRRadio.resume();
    radioWasOn = false;                                      // riprendi la radio se era accesa
  };

  function reset() {
    px = (W - PW) / 2; target = px;
    dist = 0; bonus = 0; score = 0; inv = 0; mult = 0;
    items = []; popups = []; fx = [];
    spawnT = 60; coinT = 120; haloT = 1500; relicT = 3200; fwT = 6800;
    animT = 0; shake = 0; reported = false; pointerX = null;
    coinRain = 0; coinRainT = 0;
  }
  reset();

  // ── Messaggi arcade ─────────────────────────────────────────────
  function arcadeFlash(text) {
    if (!flash) return;
    flash.textContent = text;
    flash.classList.remove('show'); void flash.offsetWidth; flash.classList.add('show');
  }
  if (flash) flash.addEventListener('animationend', () => flash.classList.remove('show'));

  function popup(x, y, text, color, size) {
    popups.push({ x, y, text, color: color || '#f5c842', size: size || 9, t: 0, life: 48, vy: 0.55 });
  }

  // ── Input ───────────────────────────────────────────────────────
  function start() {
    if (state === 'run') return;
    if (overTimer) { clearTimeout(overTimer); overTimer = null; }
    reset(); requestGameTicket(); state = 'run'; hideOverlay(); arcadeFlash('VIA!'); setPauseBtn(); songPlay();
  }
  function tryStart() { if (state === 'idle' || state === 'over') start(); }
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (/input|textarea/i.test(tag || '')) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {        // pausa / riprendi
      if (state === 'run') pause(); else if (state === 'paused') resume();
      e.preventDefault(); return;
    }
    if (state === 'paused') return;                        // in pausa gli altri tasti non fanno nulla
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keyL = true; tryStart(); e.preventDefault(); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { keyR = true; tryStart(); e.preventDefault(); }
    else if (e.code === 'Space' || e.code === 'Enter') { tryStart(); e.preventDefault(); }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyL = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keyR = false;
  });

  function canvasX(clientX) {
    const r = canvas.getBoundingClientRect();
    return (clientX - r.left) / r.width * W;
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state === 'paused') return;
    if (state !== 'run') { start(); return; }
    pointerX = canvasX(e.clientX);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => { if (pointerX !== null) pointerX = canvasX(e.clientX); });
  const drop = () => { pointerX = null; };
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);
  // Niente menu nativo / selezione su pressione prolungata o tap ripetuti (mobile)
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const stopSelect = (e) => e.preventDefault();
  canvas.addEventListener('selectstart', stopSelect);
  const gmRoot = document.getElementById('gmRoot');
  if (gmRoot) {
    gmRoot.addEventListener('selectstart', stopSelect);
    gmRoot.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.gm-stage, .gm-pad')) e.preventDefault();
    });
  }

  // Controller mobile: pulsanti ◀ ▶ da tenere premuti
  function holdButton(btn, set) {
    if (!btn) return;
    const press = (e) => { e.preventDefault(); tryStart(); set(true); try { btn.setPointerCapture(e.pointerId); } catch (_) {} };
    const release = (e) => { if (e && e.preventDefault) e.preventDefault(); set(false); };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  holdButton(document.getElementById('gmLeft'), (v) => { keyL = v; });
  holdButton(document.getElementById('gmRight'), (v) => { keyR = v; });

  const playBtn = document.getElementById('gmPlayBtn');
  if (playBtn) playBtn.addEventListener('click', (e) => { e.preventDefault(); start(); });

  // ── Pausa (menu 8-bit) ──────────────────────────────────────────
  const pauseBtn = document.getElementById('gmPauseBtn');
  const pauseOverlay = document.getElementById('gmPause');
  const kicker = document.getElementById('gmKicker');
  function setPauseBtn() { if (pauseBtn) pauseBtn.classList.toggle('is-on', state === 'run'); }

  // ── Mute della canzone del gioco (solo la traccia del gioco, non la radio) ──
  const muteBtn = document.getElementById('gmMuteBtn');
  function applyMute() {
    if (gameSong) gameSong.muted = songMuted;
    if (muteBtn) {
      muteBtn.classList.toggle('is-muted', songMuted);
      muteBtn.setAttribute('aria-pressed', songMuted ? 'true' : 'false');
      muteBtn.title = songMuted ? 'Riattiva audio' : 'Muta la canzone';
    }
  }
  function toggleMute() { songMuted = !songMuted; applyMute(); }
  if (muteBtn) muteBtn.addEventListener('click', (e) => { e.preventDefault(); toggleMute(); });
  applyMute();
  function pause() {
    if (state !== 'run') return;
    state = 'paused'; keyL = keyR = false; pointerX = null;
    if (pauseOverlay) pauseOverlay.classList.remove('gm-hidden');
    setPauseBtn(); songPause();
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'run'; last = 0;                              // niente salto di dt alla ripresa
    if (pauseOverlay) pauseOverlay.classList.add('gm-hidden');
    setPauseBtn(); songResume();
  }
  function restart() {
    if (pauseOverlay) pauseOverlay.classList.add('gm-hidden');
    reset(); requestGameTicket(); state = 'run'; last = 0; hideOverlay(); setPauseBtn(); arcadeFlash('VIA!'); songPlay();
  }
  function quitToMenu() {
    if (pauseOverlay) pauseOverlay.classList.add('gm-hidden');
    if (overTimer) { clearTimeout(overTimer); overTimer = null; }
    reset(); state = 'idle'; setPauseBtn(); showOverlay('idle'); songStop();
  }
  if (pauseBtn) pauseBtn.addEventListener('click', (e) => { e.preventDefault(); pause(); });
  if (pauseOverlay) {
    const rb = document.getElementById('gmResume'), sb = document.getElementById('gmRestart'), qb = document.getElementById('gmQuit');
    if (rb) rb.addEventListener('click', (e) => { e.preventDefault(); resume(); });
    if (sb) sb.addEventListener('click', (e) => { e.preventDefault(); restart(); });
    if (qb) qb.addEventListener('click', (e) => { e.preventDefault(); quitToMenu(); });
  }

  function hideOverlay() { overlay.classList.add('gm-hidden'); }
  function showOverlay(mode, sc) {
    overlay.classList.remove('gm-hidden');
    if (mode === 'idle') {
      if (kicker) kicker.textContent = 'Insert coin';
      ovTitle.textContent = 'Corri San Rocco';
      ovScore.innerHTML = 'Schiva torce e bombe, raccogli le monete d\'oro';
      ovHint.innerHTML = 'Usa <kbd>←</kbd> <kbd>→</kbd> o trascina per spostarti';
      if (playBtn) playBtn.textContent = 'Gioca';
    } else {
      if (kicker) kicker.textContent = 'Game over';
      ovTitle.textContent = 'Riprova?';
      ovScore.innerHTML = 'Punteggio: <b>' + sc + '</b>' + (sc >= best ? ' · nuovo record!' : '');
      ovHint.innerHTML = 'Premi <kbd>←</kbd>/<kbd>→</kbd> o tocca per ripartire';
      if (playBtn) playBtn.textContent = 'Riprova';
    }
  }
  showOverlay('idle');

  // ── Disegno pixel ───────────────────────────────────────────────
  function r(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }
  function disc(cx, cy, rad, c) { ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fillStyle = c; ctx.fill(); }

  function drawSaint(x, y, frame, shielded, t) {
    if (shielded) {                                   // aureola + alone invincibilità
      ctx.save();
      ctx.shadowColor = 'rgba(243,198,75,.9)'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.ellipse(x + 9, y + 1, 8, 3, 0, 0, 7); ctx.strokeStyle = '#f5c842'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
    }
    const a = frame ? 0 : 2, b = frame ? 2 : 0;
    r(x + 16, y + 6, 2, 26, '#7a5a2e');
    r(x + 15, y + 5, 4, 3, '#caa24a');
    r(x + 5, y + 26, 3, 6 - a, '#3a2c18');
    r(x + 10, y + 26, 3, 6 - b, '#3a2c18');
    r(x + 4, y + 13, 10, 14, '#9a6b3b');
    r(x + 4, y + 13, 10, 3, '#b07d44');
    r(x + 8, y + 16, 2, 5, '#c0392b');
    r(x + 7, y + 17, 4, 2, '#c0392b');
    r(x + 12, y + 15, 3, 8, '#9a6b3b');
    r(x + 7, y + 8, 5, 5, '#e8c49a');
    r(x + 7, y + 11, 5, 2, '#d9d2c2');
    r(x + 4, y + 6, 11, 2, '#5a4326');
    r(x + 6, y + 2, 7, 4, '#6b4f2c');
  }

  function drawDog(x, y, frame) {
    r(x + 2, y + 3, 10, 4, '#8a5a2c');
    r(x + 10, y + 1, 4, 4, '#8a5a2c');
    r(x + 13, y + 3, 2, 2, '#f1c84b');
    r(x, y + 4, 2, 2, '#6e4621');
    const a = frame ? 0 : 2;
    r(x + 3, y + 7, 2, 3 - a, '#5e3c1c');
    r(x + 9, y + 7, 2, 1 + a, '#5e3c1c');
  }

  function drawItem(o, t) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    if (o.kind === 'coin') {
      const glow = (Math.floor(t / 8) % 2);
      disc(cx, cy, o.w / 2 + (glow ? 0.4 : 0), '#b8860b');
      disc(cx, cy, o.w / 2 - 1.5, '#f5c842');
      r(cx - 1, cy - o.h / 2 + 2, 1, o.h - 4, '#fff7d0');     // glint
      return;
    }
    if (o.kind === 'halo') {
      ctx.save();
      ctx.shadowColor = 'rgba(243,198,75,.9)'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(cx, cy, o.w / 2, 0, 7); ctx.strokeStyle = '#f5c842'; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, o.w / 2 - 3, 0, 7); ctx.strokeStyle = 'rgba(245,200,66,.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
      return;
    }
    if (o.kind === 'relic') {            // EPICO — gemma viola rotante
      ctx.save();
      ctx.shadowColor = 'rgba(190,120,255,.9)'; ctx.shadowBlur = 10;
      ctx.translate(cx, cy); ctx.rotate(Math.PI / 4 + Math.sin(t / 14) * 0.12);
      const s = o.w * 0.66;
      r(-s / 2, -s / 2, s, s, '#b06bff');
      r(-s / 2, -s / 2, s, s / 3, '#e6caff');
      ctx.strokeStyle = '#7a2dd6'; ctx.lineWidth = 1.2; ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.restore();
      return;
    }
    if (o.kind === 'fw') {               // LEGGENDARIO — fuoco d'artificio multicolore
      const cols = ['#ff5a3c', '#f5c842', '#5ad1ff', '#7bff9a', '#ff8ad1'];
      ctx.save();
      ctx.shadowColor = 'rgba(255,150,80,.95)'; ctx.shadowBlur = 11;
      const spin = t / 6, rr = o.w / 2;
      for (let a = 0; a < 8; a++) {
        const ang = a / 8 * Math.PI * 2 + spin;
        r(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, 2, 2, cols[a % cols.length]);
        r(cx + Math.cos(ang) * rr * 0.55, cy + Math.sin(ang) * rr * 0.55, 1, 1, cols[(a + 2) % cols.length]);
      }
      disc(cx, cy, 2.4, '#fff7d0');
      ctx.restore();
      return;
    }
    // ostacoli
    if (o.type === 'torch') {
      r(o.x + o.w / 2 - 1, o.y, 2, o.h, '#6b4a25');
      const fl = (Math.floor(t / 5) % 2) ? 1 : 0;
      r(o.x + o.w / 2 - 2, o.y + o.h - 1 + fl, 4, 5, '#e8861e');
      r(o.x + o.w / 2 - 1, o.y + o.h + 2 + fl, 2, 3, '#f5c842');
    } else if (o.type === 'bomb') {
      r(o.x + 1, o.y + 1, o.w - 2, o.h - 1, '#2b2b33');
      r(o.x, o.y + 3, o.w, o.h - 4, '#2b2b33');
      r(o.x + 2, o.y + 2, 2, 2, '#555');
      r(o.x + o.w / 2 - 1, o.y - 3, 2, 3, '#888');
      const s = (Math.floor(t / 4) % 2);
      r(o.x + o.w / 2 - 1, o.y - 4, 2, 2, s ? '#f5c842' : '#e84e1b');
    } else {
      r(o.x, o.y, o.w, o.h, '#3a2f1a');
      r(o.x, o.y, o.w, 2, '#6b4a25');
      r(o.x, o.y + o.h - 2, o.w, 2, '#241b0e');
    }
  }

  function arcadeText(x, y, text, color, size, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = size + "px " + ARCADE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, size / 3);
    ctx.strokeStyle = 'rgba(0,0,0,.92)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ── Sfondo ──────────────────────────────────────────────────────
  const stars = Array.from({ length: 34 }, () => ({ x: Math.random() * W, y: Math.random() * (GROUND - 40), s: Math.random() }));
  function drawBg(t) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, '#0a0a1e'); g.addColorStop(0.6, '#10101f'); g.addColorStop(1, '#181226');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND);
    stars.forEach((s) => { if ((Math.sin(t / 30 + s.x) + 1) / 2 > 0.35 - s.s * 0.2) r(s.x, s.y, 1, 1, 'rgba(255,250,220,.8)'); });
    const bx = 24;
    r(bx, GROUND - 50, 12, 50, '#0d0b1a'); r(bx + 2, GROUND - 58, 8, 10, '#0d0b1a'); r(bx + 4, GROUND - 64, 4, 8, '#0d0b1a');
    r(0, GROUND, W, H - GROUND, '#221a10');
    r(0, GROUND, W, 2, '#3c2e1a');
  }

  function burst(x, y, c) { fx.push({ x, y, t: 0, c: c || '#e8861e' }); }
  function drawFx() {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.t += 1;
      const rad = Math.min(11, f.t * 0.8), al = Math.max(0, 1 - f.t / 26);
      ctx.globalAlpha = al;
      for (let a = 0; a < 8; a++) { const ang = a / 8 * Math.PI * 2; r(f.x + Math.cos(ang) * rad, f.y + Math.sin(ang) * rad, 1, 1, f.c); }
      ctx.globalAlpha = 1;
      if (f.t > 26) fx.splice(i, 1);
    }
  }

  // ── Fuochi d'artificio di sfondo (sempre attivi: razzo che sale + esplosione) ──
  const FW_COLORS = ['#f5c842', '#ff5a3c', '#5ad1ff', '#7bff9a', '#ff8ad1', '#c98bff', '#fff7d0'];
  const FW_TYPES = ['peony', 'peony', 'peony', 'ring', 'chrys', 'double', 'heart'];  // peonia più frequente
  let bgFw = [];
  let bgFwT = 10;
  function fwColor() { return FW_COLORS[Math.random() * FW_COLORS.length | 0]; }
  function spawnBgFw(opts) {
    opts = opts || {};
    const c1 = fwColor();
    let c2 = fwColor(); if (c2 === c1) c2 = fwColor();          // secondo colore per esplosioni miste
    bgFw.push({
      rise: true,
      x: opts.x != null ? opts.x : 24 + Math.random() * (W - 48),
      y: GROUND - 4,
      vy: -(1.5 + Math.random() * 1.1),
      ty: opts.ty != null ? opts.ty : 16 + Math.random() * 70,   // quota dell'esplosione (cielo)
      color: c1, color2: c2,
      type: opts.type || FW_TYPES[Math.random() * FW_TYPES.length | 0],
      trail: [],
    });
  }
  // Crea le particelle secondo la forma dell'esplosione
  function makeParts(s, cx, cy) {
    const parts = [];
    const push = (ang, v, col, life) => {
      parts.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
        t: 0, max: life || (34 + Math.random() * 22),
        col: col, hist: [],
      });
    };
    if (s.type === 'ring') {
      const n = 40, spd = 1.15 + Math.random() * 0.35;
      for (let a = 0; a < n; a++) push((a / n) * Math.PI * 2, spd, Math.random() < 0.5 ? s.color : s.color2);
    } else if (s.type === 'chrys') {                             // cascata dorata a caduta
      const n = 46;
      for (let a = 0; a < n; a++) { const v = 0.6 + Math.random() * 1.1; push((a / n) * Math.PI * 2 + Math.random() * 0.2, v, Math.random() < 0.75 ? '#f5c842' : '#fff7d0', 44 + Math.random() * 26); }
    } else if (s.type === 'double') {                            // corona interna + esplosione esterna
      const n1 = 22, n2 = 34;
      for (let a = 0; a < n1; a++) push((a / n1) * Math.PI * 2, 0.55 + Math.random() * 0.3, s.color);
      for (let a = 0; a < n2; a++) push((a / n2) * Math.PI * 2, 1.25 + Math.random() * 0.35, s.color2);
    } else if (s.type === 'heart') {                             // cuore per San Rocco
      const n = 40, sc = 0.13 + Math.random() * 0.03;
      for (let a = 0; a < n; a++) {
        const t = (a / n) * Math.PI * 2;
        const hx = 16 * Math.pow(Math.sin(t), 3);
        const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        push(Math.atan2(hy, hx), Math.hypot(hx, hy) * sc, Math.random() < 0.5 ? '#ff5a3c' : '#ff8ad1');
      }
    } else {                                                     // peony (classica)
      const n = 52 + (Math.random() * 16 | 0);
      const spd = 0.9 + Math.random() * 0.7;
      for (let a = 0; a < n; a++) {
        const ang = (a / n) * Math.PI * 2 + Math.random() * 0.15;
        const v = spd * (0.5 + Math.random() * 0.7);
        push(ang, v, Math.random() < 0.85 ? s.color : s.color2);
      }
    }
    return parts;
  }
  function bgFwExplode(s) {
    const chrys = s.type === 'chrys';
    bgFw.push({ rise: false, type: s.type, color: s.color, color2: s.color2, cx: s.x, cy: s.y, parts: makeParts(s, s.x, s.y), flash: 0, grav: chrys ? 0.06 : 0.04, drag: chrys ? 0.99 : 0.982 });
  }
  function drawBgFw(dt) {
    bgFwT -= dt;
    if (bgFwT <= 0) { spawnBgFw(); bgFwT = 14 + Math.random() * 34; }   // cadenza continua
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';                          // bagliore additivo
    for (let i = bgFw.length - 1; i >= 0; i--) {
      const s = bgFw[i];
      if (s.rise) {
        s.y += s.vy * dt;
        // scia scintillante del razzo che sale
        s.trail.push({ x: s.x, y: s.y }); if (s.trail.length > 6) s.trail.shift();
        for (let k = 0; k < s.trail.length; k++) { ctx.globalAlpha = (k / s.trail.length) * 0.5; r(s.trail[k].x, s.trail[k].y, 1, 2, '#ffd98a'); }
        ctx.globalAlpha = 1; r(s.x, s.y, 1, 2, s.color);
        if (s.y <= s.ty) { bgFwExplode(s); bgFw.splice(i, 1); }
      } else {
        s.flash += dt;
        // lampo iniziale dell'esplosione
        if (s.flash < 6) { ctx.globalAlpha = (1 - s.flash / 6) * 0.9; disc(s.cx, s.cy, 2 + s.flash * 0.7, '#fff7d0'); }
        let alive = false;
        for (const p of s.parts) {
          p.t += dt;
          if (p.t >= p.max) continue;
          alive = true;
          // scia luminosa che svanisce
          p.hist.push({ x: p.x, y: p.y }); if (p.hist.length > 4) p.hist.shift();
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vy += s.grav * dt;                // gravità
          p.vx *= s.drag; p.vy *= s.drag;
          const fade = Math.max(0, 1 - p.t / p.max);
          for (let k = 0; k < p.hist.length; k++) { ctx.globalAlpha = fade * (k / p.hist.length) * 0.4; r(p.hist[k].x, p.hist[k].y, 1, 1, p.col); }
          // scintillio finale (twinkle): sfarfalla verso fine vita
          const twinkle = p.t > p.max * 0.55 && (Math.random() < 0.4);
          ctx.globalAlpha = fade;
          r(p.x, p.y, 2, 2, twinkle ? '#fffdf0' : p.col);
        }
        if (!alive) bgFw.splice(i, 1);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  // Gran finale: ondata di lanci simultanei (momenti chiave)
  function fwFinale(n) {
    n = n || 5;
    for (let k = 0; k < n; k++) {
      const delay = k * (3 + Math.random() * 4);
      setTimeout(() => spawnBgFw({ x: 20 + Math.random() * (W - 40), ty: 18 + Math.random() * 55, type: k === 0 ? 'heart' : undefined }), delay * 16);
    }
  }

  // ── Spawn ───────────────────────────────────────────────────────
  function spawnObstacle() {
    const types = ['bomb', 'torch', 'crate'];
    const type = types[Math.floor(Math.random() * types.length)];
    const w = type === 'crate' ? 14 + (Math.random() * 6 | 0) : 9 + (Math.random() * 4 | 0);
    const h = type === 'torch' ? 16 : (type === 'bomb' ? w : 12 + (Math.random() * 6 | 0));
    items.push({ kind: 'hit', x: 4 + Math.random() * (W - w - 8), y: -h - 4, w, h, type, vs: Math.random() * 0.6 });
  }
  function spawnCoin(x) {
    const w = 9;
    items.push({ kind: 'coin', x: x != null ? x : (6 + Math.random() * (W - w - 12)), y: -w - 4, w, h: w, vs: -0.4 });
  }
  function spawnHalo() {
    const w = 13;
    items.push({ kind: 'halo', x: 8 + Math.random() * (W - w - 16), y: -w - 6, w, h: w, vs: -0.6 });
  }
  function spawnRelic() {   // EPICO: reliquia d'oro → punteggio ×2 a tempo
    const w = 13;
    items.push({ kind: 'relic', x: 10 + Math.random() * (W - w - 20), y: -w - 6, w, h: w + 2, vs: -0.5 });
  }
  function spawnFw() {      // LEGGENDARIO: fuochi → spazza gli ostacoli + super bonus
    const w = 14;
    items.push({ kind: 'fw', x: 12 + Math.random() * (W - w - 24), y: -w - 6, w, h: w, vs: -0.7 });
  }

  // ── Loop ────────────────────────────────────────────────────────
  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    let dt = (now - last) / 16.667; last = now;
    if (dt > 2.5) dt = 2.5;
    ctx.clearRect(0, 0, W, H);

    const diff = Math.min(1, score / 360);
    const fallSpeed = 1.7 + diff * 2.6;
    const spawnEvery = 56 - diff * 32;
    const moveSpeed = 3.3 + diff * 0.7;

    if (state === 'run') {
      animT += dt;
      const x2 = mult > 0 ? 2 : 1;
      dist += (1.9 + diff * 1.4) * dt * x2;
      if (inv > 0) inv -= dt;
      if (mult > 0) mult -= dt;

      // movimento
      if (pointerX !== null) { target = pointerX - PW / 2; px += (target - px) * Math.min(1, 0.32 * dt); }
      else { if (keyL) px -= moveSpeed * dt; if (keyR) px += moveSpeed * dt; }
      if (px < 2) px = 2; if (px > W - PW - 2) px = W - PW - 2;

      // spawn
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnObstacle();
        if (diff > 0.55 && Math.random() < diff * 0.5) spawnObstacle();
        spawnT = spawnEvery + Math.random() * 16;
      }
      coinT -= dt;
      if (coinT <= 0) {
        if (Math.random() < 0.22) { const bx = 30 + Math.random() * (W - 90); spawnCoin(bx); spawnCoin(bx + 16); spawnCoin(bx + 32); popup(bx + 16, 40, 'BONUS!', '#f5c842', 10); }
        else spawnCoin();
        coinT = 150 + Math.random() * 80;
      }
      haloT -= dt;
      if (haloT <= 0) {
        if (inv <= 0 && !items.some((o) => o.kind === 'halo')) spawnHalo();
        haloT = 1400 + Math.random() * 700;
      }
      // EPICO — reliquia (×2 punteggio): più rara dell'aureola
      relicT -= dt;
      if (relicT <= 0) {
        if (mult <= 0 && !items.some((o) => o.kind === 'relic')) spawnRelic();
        relicT = 3000 + Math.random() * 1900;
      }
      // LEGGENDARIO — fuochi d'artificio: rarissimi
      fwT -= dt;
      if (fwT <= 0) {
        if (!items.some((o) => o.kind === 'fw')) spawnFw();
        fwT = 6500 + Math.random() * 3800;
      }
      // Pioggia di monete: bonus FUOCHI → cascata d'oro scaglionata dal cielo
      if (coinRain > 0) {
        coinRainT -= dt;
        if (coinRainT <= 0) {
          spawnCoin(10 + Math.random() * (W - 32));
          coinRain--;
          coinRainT = 5 + Math.random() * 6;   // ravvicinate ma non tutte insieme
        }
      }

      // caduta + interazioni
      const pbox = { x: px + 3, y: GROUND - 30, w: PW - 6, h: 28 };
      const grab = { x: px - 4, y: GROUND - 34, w: PW + 8, h: 34 };  // raggio di raccolta più ampio
      for (let i = items.length - 1; i >= 0; i--) {
        const o = items[i];
        const sp = o.kind === 'hit' ? fallSpeed + o.vs : fallSpeed * 0.8 + o.vs;
        o.y += sp * dt;
        const cx = o.x + o.w / 2, cy = o.y + o.h / 2;

        if (o.kind === 'coin') {
          if (overlap(grab, o)) { const g = 15 * x2; bonus += g; popup(cx, o.y, '+' + g, '#f5c842'); burst(cx, cy, '#f5c842'); items.splice(i, 1); continue; }
          if (o.y > GROUND - 2) { items.splice(i, 1); continue; }
        } else if (o.kind === 'halo') {
          if (overlap(grab, o)) { inv = 260; popup(cx, o.y, 'AUREOLA!', '#fff7d0', 9); arcadeFlash('AUREOLA!'); burst(cx, cy, '#f5c842'); items.splice(i, 1); continue; }
          if (o.y > GROUND - 2) { items.splice(i, 1); continue; }
        } else if (o.kind === 'relic') {        // EPICO: punteggio ×2
          if (overlap(grab, o)) { mult = 380; popup(cx, o.y, 'x2!', '#d8a8ff', 11); arcadeFlash('RELIQUIA x2'); burst(cx, cy, '#c98bff'); items.splice(i, 1); continue; }
          if (o.y > GROUND - 2) { items.splice(i, 1); continue; }
        } else if (o.kind === 'fw') {           // LEGGENDARIO: spazza gli ostacoli + super bonus
          if (overlap(grab, o)) {
            bonus += 150 * x2; inv = Math.max(inv, 150);
            popup(cx, o.y, '+' + (150 * x2), '#ff5a3c', 12); arcadeFlash('FUOCHI!'); fwFinale(7);
            coinRain = 26; coinRainT = 0;      // pioggia di monete d'oro da raccogliere
            const cols = ['#ff5a3c', '#f5c842', '#5ad1ff', '#7bff9a', '#ff8ad1'];
            items.forEach((it, k) => { if (it.kind === 'hit') burst(it.x + it.w / 2, it.y + it.h / 2, cols[k % cols.length]); });
            shake = Math.max(shake, 5);
            items = items.filter((it) => it.kind !== 'hit' && it !== o);
            break;
          }
          if (o.y > GROUND - 2) { items.splice(i, 1); continue; }
        } else { // hit
          if (o.y > GROUND - 2) { burst(cx, GROUND - 4); items.splice(i, 1); continue; }
          if (overlap(pbox, o)) {
            if (inv > 0) { burst(cx, cy, '#f5c842'); items.splice(i, 1); continue; }
            gameOver();
          }
        }
      }
      score = Math.floor(dist / 8) + bonus;
    }

    drawBg(animT);
    drawBgFw(dt);
    drawFx();
    if (shake > 0) { ctx.save(); ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake -= dt * 0.6; }

    // ombre di atterraggio (solo ostacoli)
    items.forEach((o) => {
      if (o.kind !== 'hit') return;
      const close = Math.max(0, Math.min(1, o.y / (GROUND - 30)));
      ctx.globalAlpha = 0.10 + close * 0.30; r(o.x + 1, GROUND - 2, o.w - 2, 2, '#000'); ctx.globalAlpha = 1;
    });
    items.forEach((o) => drawItem(o, animT));

    const moving = keyL || keyR || pointerX !== null;
    const fr = Math.floor(animT / 4) % 2;
    const flick = inv > 0 && inv < 70 && (Math.floor(animT / 3) % 2);   // lampeggia a fine invincibilità
    if (state === 'run' && mult > 0) {                                  // aura viola del ×2 (reliquia)
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.3 * Math.sin(animT / 4);
      ctx.shadowColor = 'rgba(190,120,255,.9)'; ctx.shadowBlur = 9;
      ctx.beginPath(); ctx.ellipse(px + 9, GROUND - 16, 13, 17, 0, 0, 7);
      ctx.strokeStyle = '#c98bff'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
    }
    drawDog(px - 14, GROUND - 10, (state === 'run' && moving) ? fr : 0);
    if (!flick) drawSaint(px, GROUND - 32, (state === 'run' && moving) ? fr : 0, inv > 0, animT);

    if (shake > 0) ctx.restore();

    // popup arcade
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i]; p.t += dt; p.y -= p.vy * dt;
      const a = Math.max(0, 1 - p.t / p.life);
      const sc = 1 + Math.max(0, (7 - p.t)) * 0.07;
      arcadeText(p.x, p.y, p.text, p.color, p.size * sc, a);
      if (p.t > p.life) popups.splice(i, 1);
    }

    // indicatore ×2 (reliquia) in alto al centro
    if (mult > 0) {
      const fade = mult < 60 ? (Math.floor(animT / 3) % 2 ? 0.35 : 1) : 1;
      const pulse = 9 + Math.max(0, Math.sin(animT / 5)) * 1.5;
      arcadeText(W / 2, 13, 'x2', '#d8a8ff', pulse, fade);
    }

    elScore.textContent = score;
  }

  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  function gameOver() {
    state = 'over'; shake = 7; inv = 0; setPauseBtn(); songStop();
    burst(px + PW / 2, GROUND - 14, '#e84e1b');
    const isRecord = score > best && score > 0;
    if (score > best) best = score;
    elBest.textContent = 'record ' + best;
    arcadeFlash(isRecord ? 'NUOVO RECORD!' : 'GAME OVER');
    if (isRecord) fwFinale(9);            // gran finale per il nuovo record
    if (logged && !reported) { reported = true; report(score); }
    overTimer = setTimeout(() => showOverlay('over', score), 700);
  }

  // ── Anti-cheat: chiede al server un ticket all'inizio di ogni partita ──
  // Il punteggio finale verrà validato rispetto al tempo reale del server.
  function requestGameTicket() {
    if (!logged) return;
    gameToken = null;
    fetch('/gioco/inizio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrf }),
    }).then((rs) => rs.ok ? rs.json() : null).then((d) => { if (d && d.token) gameToken = d.token; }).catch(() => {});
  }

  // ── Invio punteggio + traguardi ─────────────────────────────────
  function report(sc) {
    fetch('/gioco/punteggio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ score: String(sc), token: gameToken || '', _csrf: csrf }),
    }).then((rs) => rs.ok ? rs.json() : null).then((data) => {
      if (!data) return;
      if (typeof data.best === 'number') { best = Math.max(best, data.best); elBest.textContent = 'record ' + best; }
      if (data.awarded && data.awarded.length) { showToast(data.awarded); data.awarded.forEach((a) => markAchievement(a.title)); }
    }).catch(() => {});
  }

  function showToast(list) {
    toast.innerHTML = list.map((a) =>
      `<div class="gm-toast-item">${ICON_TROPHY}<span>${escapeHtml(a.title)} · <b>+${a.points} punti</b></span></div>`
    ).join('');
    toast.classList.add('gm-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('gm-show'), 4200);
  }
  function markAchievement(title) {
    document.querySelectorAll('.gm-ach').forEach((el) => {
      if (el.dataset.title === title && !el.classList.contains('is-done')) {
        el.classList.add('is-done');
        const badge = el.querySelector('.gm-ach-badge');
        if (badge) badge.innerHTML = ICON_CHECK;
      }
    });
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  const ICON_TROPHY = (document.getElementById('gmIconTrophy') || {}).innerHTML || '';
  const ICON_CHECK = (document.getElementById('gmIconCheck') || {}).innerHTML || '';

  requestAnimationFrame(frame);
})();
