/* ===================================================================
   FantaSanRocco — «San Rocco Jetpack» (stile Jetpack Joyride, pixelato)
   Tieni premuto (tap / click / SPAZIO / tasto SALI) per salire con la
   fiammata dorata, rilascia per scendere. Schiva i RAGGI DI FUOCO e i
   MISSILI, raccogli le MONETE D'ORO e travolgi i FEDELI.

   MEZZI (stile Jetpack Joyride): raccogli le LETTERE per comporre una
   parola; a parola completa San Rocco si TRASFORMA e cambiano comandi e
   fisica. Un colpo in trasformazione distrugge il mezzo, non ti uccide.
     CANE  → Cane Fedele    : salti (anche in aria), schiacci i raggi
     FUOCO → Razzo di Fuoco : sfondi tutto, più veloce
     VINO  → Brocca di Vino : galleggi, rimbalzi, calamita monete
     SANTO → Santo in Gloria: inverti la gravità a ogni tocco

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
  let state = 'idle';          // idle | run | paused | over
  let py, vy, dist, score, coins, speed, thrust, pressEdge, inv;
  let zaps, items, pops, sparks, missiles, fedeli;
  let spawnZ, spawnC, spawnHalo, spawnM, spawnF, animT, last, shake, overTimer;
  // Trasformazioni + parole
  let mode, modeT, modeMax, word, wordMode, wordIdx, letterGap;
  let gravDir, jumps, onGround, transforms, knocked, halos;
  let missions;

  // Fisica base — volo più dolce: spinta meno brusca e tetto di salita basso,
  // così il santo non "schizza" in alto ma sale in modo controllabile.
  const GRAV = 0.26, THRUST = -0.40, VUP = 2.9, VDOWN = 4.0, DRAG = 0.992;
  const PX = 60;               // x fisso del santo
  const PW = 18, PH = 30;      // dimensioni sprite base

  // ── Mezzi / trasformazioni ──────────────────────────────────────
  const MODES = {
    cane:  { name: 'CANE FEDELE',     dur: 560, col: '#c98a4b', hint: 'TOCCA PER SALTARE' },
    razzo: { name: 'RAZZO DI FUOCO',  dur: 470, col: '#ff5a3c', hint: 'SFONDI TUTTO!' },
    vino:  { name: 'BROCCA DI VINO',  dur: 560, col: '#d05a4a', hint: 'RIMBALZI E ATTIRI MONETE' },
    santo: { name: 'SANTO IN GLORIA', dur: 600, col: '#f5c842', hint: 'TOCCA PER INVERTIRE' },
  };
  const WORDS = [
    { w: 'CANE',  mode: 'cane'  },
    { w: 'FUOCO', mode: 'razzo' },
    { w: 'VINO',  mode: 'vino'  },
    { w: 'SANTO', mode: 'santo' },
  ];

  // ── Missioni (3 per partita, stile Jetpack Joyride) ─────────────
  const MISSION_POOL = [
    { id: 'coin30',  text: 'Raccogli 30 monete',        done: () => coins >= 30 },
    { id: 'coin60',  text: 'Raccogli 60 monete',        done: () => coins >= 60 },
    { id: 'dist400', text: 'Arriva a 400 m',            done: () => dist >= 400 },
    { id: 'dist700', text: 'Arriva a 700 m',            done: () => dist >= 700 },
    { id: 'tr1',     text: 'Usa un mezzo',              done: () => transforms >= 1 },
    { id: 'tr2',     text: 'Usa 2 mezzi',               done: () => transforms >= 2 },
    { id: 'fed8',    text: 'Travolgi 8 fedeli',         done: () => knocked >= 8 },
    { id: 'fed15',   text: 'Travolgi 15 fedeli',        done: () => knocked >= 15 },
    { id: 'halo1',   text: "Prendi un'aureola",         done: () => halos >= 1 },
  ];
  function rollMissions() {
    const pool = MISSION_POOL.slice();
    const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.random() * pool.length | 0, 1)[0]);
    return out;
  }

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
  // pressEdge = il tocco è appena iniziato (serve a salto e inversione gravità)
  const setThrust = (on) => { if (on && !thrust) pressEdge = true; thrust = on; };
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
  // iOS/Android: niente menu "Copia/Salva" al long-press. Il menu nasce dal gesto
  // touch nativo, che i pointer event NON sopprimono: servono i touch event
  // non-passivi + blocco di contextmenu/selectstart. Il movimento resta invariato.
  const noNative = (e) => { if (e.cancelable) e.preventDefault(); };
  canvas.addEventListener('touchstart', noNative, { passive: false });
  canvas.addEventListener('touchmove', noNative, { passive: false });
  canvas.addEventListener('touchend', noNative, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('selectstart', (e) => e.preventDefault());
  if (root) {
    root.addEventListener('selectstart', (e) => e.preventDefault());
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  if (playBtn) playBtn.addEventListener('click', (e) => { e.preventDefault(); start(); });

  // Pulsante di spinta "SALI": alternativa al tocco sullo schermo
  const thrustBtn = document.getElementById('jpThrust');
  if (thrustBtn) {
    const btnDown = (e) => {
      if (e.cancelable) e.preventDefault();
      thrustBtn.classList.add('is-on');
      if (state === 'idle' || state === 'over') { start(); return; }
      if (state === 'paused') return;
      setThrust(true);
      try { thrustBtn.setPointerCapture(e.pointerId); } catch (_) {}
    };
    const btnUp = (e) => { if (e && e.cancelable) e.preventDefault(); thrustBtn.classList.remove('is-on'); setThrust(false); };
    thrustBtn.addEventListener('pointerdown', btnDown);
    thrustBtn.addEventListener('pointerup', btnUp);
    thrustBtn.addEventListener('pointercancel', btnUp);
    thrustBtn.addEventListener('pointerleave', btnUp);
    thrustBtn.addEventListener('touchstart', noNative, { passive: false });
    thrustBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

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

  // Ingombro del personaggio: cambia col mezzo
  function dims() {
    if (mode === 'cane') return { w: 22, h: 34 };
    if (mode === 'razzo') return { w: 26, h: 26 };
    if (mode === 'vino') return { w: 20, h: 28 };
    if (mode === 'santo') return { w: 18, h: 32 };
    return { w: PW, h: PH };
  }
  // Hitbox generosa (più piccola dello sprite): perdonare è meglio che frustrare
  function hitbox() {
    const d = dims();
    return { x: PX + 5, y: py + 7, w: d.w - 11, h: d.h - 14 };
  }

  // San Rocco a piedi con jetpack — flying=true disegna la fiammata sotto i piedi
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

  // MEZZO «CANE FEDELE» — il santo cavalca il cane, che corre e salta
  function drawCane(x, y, t) {
    const step = Math.floor(t / 4) % 2;
    // cane
    r(x + 2, y + 20, 18, 8, '#c98a4b');            // corpo
    r(x + 16, y + 15, 7, 7, '#c98a4b');            // testa
    r(x + 22, y + 18, 3, 2, '#8a5a2b');            // muso
    r(x + 17, y + 13, 2, 3, '#8a5a2b');            // orecchio
    r(x + 0, y + 18, 3, 5, '#8a5a2b');             // coda
    r(x + 4, y + 27, 3, 6 - step * 2, '#8a5a2b');  // zampe (animate)
    r(x + 14, y + 27, 3, 4 + step * 2, '#8a5a2b');
    r(x + 19, y + 17, 1, 1, '#1b1108');            // occhio
    // santo in groppa (versione compatta)
    r(x + 6, y + 6, 9, 13, '#9a6b3b');             // tunica
    r(x + 6, y + 6, 9, 3, '#b07d44');
    r(x + 9, y + 10, 2, 4, '#c0392b');             // segno rosso
    r(x + 8, y + 1, 5, 5, '#e8c49a');              // volto
    r(x + 7, y + 0, 7, 2, '#5a4326');              // cappello
  }

  // MEZZO «RAZZO DI FUOCO» — sfonda tutto
  function drawRazzo(x, y, t) {
    const f = Math.floor(t / 2) % 3;
    ctx.save();
    ctx.shadowColor = 'rgba(255,120,40,.95)'; ctx.shadowBlur = 12;
    // scia posteriore
    r(x - 8 - f * 2, y + 10, 8 + f * 2, 6, '#ff8a1e');
    r(x - 5 - f, y + 12, 5 + f, 2, '#fff2b0');
    ctx.restore();
    // corpo del razzo
    r(x + 2, y + 8, 18, 11, '#d9d2c2');
    r(x + 2, y + 8, 18, 3, '#f4efe6');
    r(x + 20, y + 10, 5, 7, '#ff5a3c');            // ogiva
    r(x + 24, y + 12, 2, 3, '#ffd08a');
    r(x + 4, y + 4, 5, 5, '#c0392b');              // pinna sup
    r(x + 4, y + 18, 5, 5, '#c0392b');             // pinna inf
    // oblò col santo
    disc(x + 13, y + 13, 4, '#10101f');
    disc(x + 13, y + 13, 3, '#e8c49a');
    r(x + 11, y + 9, 6, 2, '#5a4326');             // cappello
  }

  // MEZZO «BROCCA DI VINO» — galleggia e rimbalza, attira le monete
  function drawVino(x, y, t) {
    const w = Math.sin(t / 8) * 1.5;
    ctx.save();
    ctx.translate(w, 0);
    // brocca
    r(x + 3, y + 10, 14, 16, '#7d2f28');
    r(x + 3, y + 10, 14, 3, '#a33f34');
    r(x + 16, y + 14, 4, 7, '#7d2f28');            // manico
    r(x + 18, y + 15, 2, 5, '#5e221c');
    r(x + 6, y + 6, 8, 5, '#8c352c');              // collo
    r(x + 5, y + 4, 10, 3, '#a33f34');             // bocca
    // bollicine
    const b = Math.floor(t / 6) % 3;
    r(x + 8, y - 1 - b, 2, 2, 'rgba(224,120,110,.85)');
    r(x + 12, y - 3 - b, 1, 1, 'rgba(224,120,110,.6)');
    // santo che sbuca
    r(x + 7, y + 13, 6, 6, '#e8c49a');
    r(x + 6, y + 11, 8, 2, '#5a4326');
    ctx.restore();
  }

  // MEZZO «SANTO IN GLORIA» — gravità invertibile, aureola enorme
  function drawSanto(x, y, t, flip) {
    ctx.save();
    if (flip) { ctx.translate(x + 9, y + 16); ctx.scale(1, -1); ctx.translate(-(x + 9), -(y + 16)); }
    // gloria dorata
    ctx.shadowColor = 'rgba(245,200,66,.95)'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(x + 9, y + 6, 8, 0, 7);
    ctx.strokeStyle = '#f5c842'; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0;
    // raggi
    for (let a = 0; a < 8; a++) {
      const ang = a / 8 * Math.PI * 2 + t / 40;
      r(x + 9 + Math.cos(ang) * 13, y + 16 + Math.sin(ang) * 13, 2, 2, 'rgba(245,200,66,.55)');
    }
    ctx.restore();
    // tunica bianca "in gloria"
    r(x + 4, y + 13, 10, 15, '#efe7d4');
    r(x + 4, y + 13, 10, 3, '#fff7e2');
    r(x + 8, y + 17, 2, 5, '#c0392b');
    r(x + 5, y + 27, 3, 5, '#cfc4a8');
    r(x + 10, y + 27, 3, 5, '#cfc4a8');
    r(x + 7, y + 8, 5, 5, '#e8c49a');
    r(x + 7, y + 11, 5, 2, '#d9d2c2');
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

  // Gettone LETTERA da raccogliere per comporre la parola
  function drawLetter(o, t) {
    const pulse = (Math.floor(t / 6) % 2) ? 1 : 0;
    ctx.save();
    ctx.shadowColor = 'rgba(120,200,255,.85)'; ctx.shadowBlur = 8 + pulse * 3;
    r(o.x, o.y, o.w, o.h, '#123049');
    r(o.x, o.y, o.w, 2, '#5ad1ff');
    r(o.x, o.y + o.h - 2, o.w, 2, '#2b7fa8');
    ctx.restore();
    ctx.save();
    ctx.font = "8px " + ARCADE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#eaf8ff';
    ctx.fillText(o.ch, o.x + o.w / 2, o.y + o.h / 2 + 1);
    ctx.restore();
  }

  // Fedele che corre sul sagrato (si può travolgere, non fa male)
  function drawFedele(f, t) {
    if (f.down) {
      r(f.x, GROUND - 6, 12, 5, '#2f4858');          // steso a terra
      r(f.x + 9, GROUND - 9, 4, 4, '#e8c49a');
      return;
    }
    const step = Math.floor(t / 3) % 2;
    r(f.x + 2, f.y + 5, 7, 9, '#2f4858');            // corpo
    r(f.x + 3, f.y + 14, 2, 4 - step, '#1d2f3b');    // gambe
    r(f.x + 6, f.y + 14, 2, 2 + step, '#1d2f3b');
    r(f.x + 3, f.y, 5, 5, '#e8c49a');                // testa
    r(f.x + 3, f.y, 5, 2, '#3a2c18');                // capelli
    r(f.x + 8, f.y + 6, 2, 5, '#e8c49a');            // braccio alzato
  }

  // Missile: prima l'ALLARME sul bordo, poi parte
  function drawMissile(m, t) {
    if (m.warn > 0) {
      const on = (Math.floor(t / 4) % 2);
      ctx.save();
      ctx.globalAlpha = on ? 1 : 0.35;
      ctx.shadowColor = 'rgba(255,90,50,.9)'; ctx.shadowBlur = 10;
      // triangolo di allarme sul bordo destro
      ctx.beginPath();
      ctx.moveTo(W - 4, m.y); ctx.lineTo(W - 16, m.y - 7); ctx.lineTo(W - 16, m.y + 7);
      ctx.closePath(); ctx.fillStyle = '#ff5a3c'; ctx.fill();
      ctx.restore();
      arcadeText(W - 26, m.y, '!', '#fff2b0', 8, on ? 1 : 0.4);
      return;
    }
    const f = Math.floor(t / 2) % 2;
    ctx.save();
    ctx.shadowColor = 'rgba(255,140,60,.9)'; ctx.shadowBlur = 9;
    r(m.x + 12, m.y - 3, 5, 6, '#ff8a1e');           // fiamma
    r(m.x + 15, m.y - 2, 3 + f * 2, 4, '#fff2b0');
    ctx.restore();
    r(m.x, m.y - 4, 14, 8, '#d9d2c2');               // corpo
    r(m.x - 5, m.y - 2, 5, 4, '#ff5a3c');            // punta
    r(m.x + 10, m.y - 7, 4, 4, '#c0392b');           // alette
    r(m.x + 10, m.y + 3, 4, 4, '#c0392b');
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

  // ── Parole & trasformazioni ─────────────────────────────────────
  function pickWord() {
    const c = WORDS[Math.random() * WORDS.length | 0];
    word = c.w; wordMode = c.mode; wordIdx = 0;
    letterGap = 70;
  }
  function transform(m) {
    mode = m; modeMax = MODES[m].dur; modeT = modeMax;
    transforms++;
    gravDir = 1; jumps = 0; onGround = false;
    vy = Math.min(vy, 0);
    shake = 10;
    burst(PX + 10, py + 14, MODES[m].col, 26);
    showToast(MODES[m].name + ' · ' + MODES[m].hint);
    popup(PX, py - 10, MODES[m].name, MODES[m].col);
    // togli dallo schermo le lettere rimaste
    items = items.filter((o) => o.kind !== 'letter');
  }
  function endMode(destroyed) {
    if (destroyed) {
      shake = 14;
      burst(PX + 10, py + 12, '#ff8a1e', 28);
      showToast('MEZZO DISTRUTTO!');
      inv = 110;                       // respiro dopo aver perso il mezzo
    } else {
      showToast('Mezzo esaurito');
      inv = 60;
    }
    mode = null; modeT = 0; gravDir = 1; jumps = 0;
    const d = dims();
    py = Math.max(CEIL + 1, Math.min(GROUND - d.h, py));
    pickWord();
  }

  // ── Setup / start ───────────────────────────────────────────────
  function reset() {
    py = GROUND - PH - 20; vy = 0; dist = 0; score = 0; coins = 0;
    speed = 1.55; thrust = false; pressEdge = false; inv = 0;
    zaps = []; items = []; pops = []; sparks = []; missiles = []; fedeli = [];
    // primi metri tranquilli: nessun raggio subito (grazia iniziale)
    spawnZ = 150; spawnC = 60; spawnHalo = 700 + Math.random() * 500;
    spawnM = 900 + Math.random() * 500; spawnF = 120;
    animT = 0; shake = 0;
    mode = null; modeT = 0; modeMax = 1;
    gravDir = 1; jumps = 0; onGround = false;
    transforms = 0; knocked = 0; halos = 0;
    missions = rollMissions();
    pickWord();
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
    state = 'paused'; thrust = false; pressEdge = false;
    if (pauseOverlay) pauseOverlay.classList.remove('jp-hidden');
    setPauseBtn();
    songPause();
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'run'; last = 0; pressEdge = false;   // last=0 → dt=0 al primo frame (niente salti)
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
    const doneList = missions.map((m) => (m.done() ? '✅ ' : '⬜ ') + m.text).join('<br>');
    overTimer = setTimeout(() => {
      overlay.classList.remove('jp-hidden');
      if (ovKicker) ovKicker.textContent = 'Game over';
      ovTitle.textContent = 'Riprova?';
      ovDesc.innerHTML = 'Distanza: <b>' + total + ' m</b> · Monete: <b>' + coins + '</b> · Mezzi: <b>' + transforms + '</b>'
        + (total >= best ? ' · nuovo record!' : '')
        + '<br><span class="jp-missions">' + doneList + '</span>';
      ovHint.innerHTML = 'Tieni premuto <kbd>SPAZIO</kbd> o tocca per volare';
      if (playBtn) playBtn.textContent = 'Riprova';
    }, 700);
  }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg; toast.classList.add('jp-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('jp-toast-show'), 1100);
  }

  // ── Spawner ─────────────────────────────────────────────────────
  function spawnZap() {
    const vertical = Math.random() < 0.5;
    if (vertical) {
      const h = 30 + Math.random() * 38;
      const fromTop = Math.random() < 0.5;
      const y = fromTop ? CEIL + 1 : GROUND - h;
      zaps.push({ x: W + 4, y, w: 6, h });
    } else {
      const w = 36 + Math.random() * 34;
      const y = CEIL + 16 + Math.random() * (GROUND - CEIL - 46);
      zaps.push({ x: W + 4, y, w, h: 6 });
    }
  }
  function spawnCoins() {
    const n = 5 + Math.floor(Math.random() * 4);
    const baseY = CEIL + 18 + Math.random() * (GROUND - CEIL - 60);
    const arc = Math.random() < 0.5;
    for (let i = 0; i < n; i++) {
      const y = arc ? baseY - Math.sin(i / (n - 1) * Math.PI) * 26 : baseY;
      items.push({ kind: 'coin', x: W + 6 + i * 14, y, w: 8, h: 8 });
    }
  }
  function spawnLetter() {
    items.push({
      kind: 'letter', ch: word[wordIdx],
      x: W + 8, y: CEIL + 22 + Math.random() * (GROUND - CEIL - 64),
      w: 12, h: 14,
    });
  }

  // ── Collisioni ──────────────────────────────────────────────────
  function hit(ax, ay, aw, ah, b) { return ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y; }

  // Un colpo incassato: in trasformazione perdi il mezzo, a piedi muori.
  // Ritorna true se la partita è finita.
  function takeHit() {
    if (inv > 0) return false;
    if (mode) { endMode(true); return false; }
    gameOver(); return true;
  }

  // ── Loop ────────────────────────────────────────────────────────
  function frame(ts) {
    const dt = Math.min(2.5, (ts - (last || ts)) / 16.67); last = ts;
    animT++;
    if (state === 'run') update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function update(dt) {
    // Velocità: sale più lentamente e con tetto più basso (partita più abbordabile)
    speed = Math.min(3.7, 1.55 + dist / 1500);
    const worldSpeed = speed * (mode === 'razzo' ? 1.35 : 1);   // il razzo corre di più
    bgX += worldSpeed * dt;
    dist += worldSpeed * dt * 0.35;
    score = dist;
    if (elScore) elScore.textContent = Math.floor(dist) + ' m';

    // ── Fisica: dipende dal mezzo ────────────────────────────────
    const d = dims();
    const top = CEIL + 1, bot = GROUND - d.h;
    if (mode === 'cane') {
      // Cane Fedele: gravità piena, salto a pressione (uno a terra + uno in aria)
      vy += 0.44 * dt;
      if (pressEdge && jumps < 2) { vy = -4.3; jumps++; burst(PX + 10, py + d.h, '#c98a4b', 5); }
      vy = Math.min(6.2, vy);
    } else if (mode === 'santo') {
      // Santo in Gloria: ogni tocco inverte la gravità
      if (pressEdge) { gravDir *= -1; burst(PX + 9, py + 16, '#f5c842', 8); }
      vy += 0.34 * gravDir * dt;
      vy = Math.max(-4.6, Math.min(4.6, vy));
    } else if (mode === 'vino') {
      // Brocca di Vino: galleggia, spinta morbida, rimbalza su cielo e terra
      vy += (thrust ? -0.30 : 0.17) * dt;
      vy = Math.max(-2.4, Math.min(2.8, vy));
    } else if (mode === 'razzo') {
      // Razzo: reattivo ma con tetto contenuto
      vy += (thrust ? -0.46 : 0.30) * dt;
      vy = Math.max(-3.4, Math.min(4.2, vy));
    } else {
      // A piedi col jetpack: spinta dolce, tetto di salita basso (niente "schizzate")
      vy += (thrust ? THRUST : GRAV) * dt;
      vy *= Math.pow(DRAG, dt);
      vy = Math.max(-VUP, Math.min(VDOWN, vy));
    }
    pressEdge = false;
    py += vy * dt;

    // pavimento / soffitto
    onGround = false;
    if (mode === 'vino') {                       // la brocca rimbalza
      if (py < top) { py = top; vy = Math.abs(vy) * 0.62 + 0.3; }
      if (py > bot) { py = bot; vy = -Math.abs(vy) * 0.62 - 0.4; burst(PX + 10, py + d.h, '#7d2f28', 4); }
    } else {
      if (py < top) { py = top; vy = 0; if (mode === 'santo' || mode === 'cane') { onGround = true; jumps = 0; } }
      if (py > bot) { py = bot; vy = 0; onGround = true; jumps = 0; }
    }

    // fiammata: solo a piedi o col razzo
    if (thrust && (!mode || mode === 'razzo') && animT % 2 === 0) burst(PX + 8, py + d.h, '#ff8a1e', 1);

    if (inv > 0) inv -= dt;

    // durata del mezzo
    if (mode) { modeT -= dt; if (modeT <= 0) endMode(false); }

    // ── Spawn ────────────────────────────────────────────────────
    spawnZ -= worldSpeed * dt;
    if (spawnZ <= 0) {
      spawnZap();
      // distanziati di più rispetto a prima: la corsa resta leggibile
      spawnZ = Math.max(38, 78 + Math.random() * 55 - Math.min(24, dist / 70));
    }
    spawnC -= worldSpeed * dt;
    if (spawnC <= 0) { spawnCoins(); spawnC = 75 + Math.random() * 65; }
    spawnHalo -= worldSpeed * dt;
    if (spawnHalo <= 0) { items.push({ kind: 'halo', x: W + 6, y: CEIL + 20 + Math.random() * (GROUND - CEIL - 60), w: 12, h: 12 }); spawnHalo = 1000 + Math.random() * 700; }
    // Missili: solo dopo i primi metri, mai durante una trasformazione appena presa
    spawnM -= worldSpeed * dt;
    if (spawnM <= 0 && dist > 220) {
      missiles.push({ warn: 52, x: W + 14, y: Math.max(CEIL + 12, Math.min(GROUND - 12, py + 14)), vx: 4.6 + Math.random() * 1.2 });
      spawnM = 780 + Math.random() * 620;
    }
    // Fedeli che corrono sul sagrato
    spawnF -= worldSpeed * dt;
    if (spawnF <= 0) { fedeli.push({ x: W + 8, y: GROUND - 18, w: 10, h: 18, down: false }); spawnF = 130 + Math.random() * 190; }
    // Lettere della parola (una alla volta; se la manchi ricompare)
    if (!mode && wordIdx < word.length && !items.some((o) => o.kind === 'letter')) {
      letterGap -= worldSpeed * dt;
      if (letterGap <= 0) { spawnLetter(); letterGap = 190 + Math.random() * 150; }
    }

    const hb = hitbox();

    // ── Raggi ────────────────────────────────────────────────────
    for (let i = zaps.length - 1; i >= 0; i--) {
      const z = zaps[i];
      z.x -= worldSpeed * dt;
      if (z.x + z.w < -6) { zaps.splice(i, 1); continue; }
      if (!hit(hb.x, hb.y, hb.w, hb.h, z)) continue;
      if (mode === 'razzo') {                                    // il razzo sfonda
        burst(z.x + z.w / 2, z.y + z.h / 2, '#ff8a1e', 14); popup(z.x, z.y - 6, '+5', '#ff8a1e');
        score += 5; shake = Math.max(shake, 6); zaps.splice(i, 1); continue;
      }
      if (mode === 'cane' && vy > 1.4) {                         // schiacciata del cane
        burst(z.x + z.w / 2, z.y + z.h / 2, '#c98a4b', 12); popup(z.x, z.y - 6, 'SCHIACCIATO', '#c98a4b');
        score += 4; vy = -3.2; jumps = 1; zaps.splice(i, 1); continue;
      }
      if (inv > 0) continue;
      if (takeHit()) return;
    }

    // ── Missili ──────────────────────────────────────────────────
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      if (m.warn > 0) {
        m.warn -= dt;
        // aggancio morbido: durante l'allarme insegue la quota del giocatore
        m.y += Math.max(-1.6, Math.min(1.6, (py + 14 - m.y) * 0.05 * dt));
        continue;
      }
      m.x -= m.vx * dt;
      if (m.x < -20) { missiles.splice(i, 1); continue; }
      if (!hit(hb.x, hb.y, hb.w, hb.h, { x: m.x - 5, y: m.y - 5, w: 20, h: 10 })) continue;
      if (mode === 'razzo') {
        burst(m.x, m.y, '#ff8a1e', 18); popup(m.x, m.y - 8, '+8', '#ff8a1e');
        score += 8; shake = Math.max(shake, 7); missiles.splice(i, 1); continue;
      }
      if (inv > 0) continue;
      missiles.splice(i, 1);
      if (takeHit()) return;
    }

    // ── Fedeli (travolgibili, innocui) ───────────────────────────
    for (let i = fedeli.length - 1; i >= 0; i--) {
      const f = fedeli[i];
      f.x -= (worldSpeed + (f.down ? 0 : 0.35)) * dt;
      if (f.x < -16) { fedeli.splice(i, 1); continue; }
      if (!f.down && hit(hb.x, hb.y, hb.w, hb.h, f)) {
        f.down = true; knocked++; score += 2;
        popup(f.x, f.y - 6, '+2', '#9ad1ff'); burst(f.x + 5, f.y + 8, '#9ad1ff', 6);
      }
    }

    // ── Oggetti: monete, aureole, lettere ────────────────────────
    const magnet = mode === 'vino';
    for (let i = items.length - 1; i >= 0; i--) {
      const o = items[i];
      o.x -= worldSpeed * dt;
      // calamita della brocca di vino: attira le monete vicine
      if (magnet && o.kind === 'coin') {
        const dx = (PX + 9) - o.x, dy = (py + 14) - o.y;
        const dd = Math.hypot(dx, dy);
        if (dd < 78 && dd > 0.1) { o.x += (dx / dd) * 2.4 * dt; o.y += (dy / dd) * 2.4 * dt; }
      }
      if (o.x + o.w < -6) { items.splice(i, 1); continue; }
      if (!hit(hb.x, hb.y, hb.w, hb.h, o)) continue;
      // toglilo SUBITO: transform() rimescola `items`, quindi niente splice dopo
      items.splice(i, 1);
      if (o.kind === 'coin') {
        coins++; score += 3; popup(o.x, o.y - 4, '+3', '#f5c842'); burst(o.x + 4, o.y + 4, '#f5c842', 5);
      } else if (o.kind === 'halo') {
        inv = 320; halos++; showToast('AUREOLA!'); popup(o.x, o.y - 6, 'AUREOLA', '#f5c842'); burst(o.x + 6, o.y + 6, '#fff2b0', 12);
      } else if (o.kind === 'letter') {
        wordIdx++; score += 2;
        popup(o.x, o.y - 6, o.ch, '#5ad1ff'); burst(o.x + 6, o.y + 7, '#5ad1ff', 8);
        if (wordIdx >= word.length) { transform(wordMode); break; }   // `items` è stato sostituito
        showToast(word.slice(0, wordIdx) + '…');
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

  // ── HUD sul canvas: parola in composizione / barra del mezzo ────
  function drawWordHud() {
    if (mode) {
      // barra di durata del mezzo
      const w = 96, x = W / 2 - w / 2, y = 16;
      const p = Math.max(0, Math.min(1, modeT / modeMax));
      r(x - 2, y - 2, w + 4, 9, 'rgba(0,0,0,.55)');
      r(x, y, w * p, 5, MODES[mode].col);
      arcadeText(W / 2, y + 15, MODES[mode].name, MODES[mode].col, 7, 0.95);
      return;
    }
    if (!word) return;
    // lettere: prese in oro, mancanti spente
    const size = 9, gap = 12;
    const startX = W / 2 - ((word.length - 1) * gap) / 2;
    for (let i = 0; i < word.length; i++) {
      const got = i < wordIdx;
      arcadeText(startX + i * gap, 20, word[i], got ? '#f5c842' : 'rgba(180,190,210,.45)', size, got ? 1 : 0.75);
    }
  }

  function render() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    ctx.clearRect(-16, -16, W + 32, H + 32);
    drawBg(animT);

    // fedeli (dietro a tutto, sul sagrato)
    fedeli.forEach((f) => drawFedele(f, animT));
    // item
    items.forEach((o) => {
      if (o.kind === 'coin') drawCoin(o, animT);
      else if (o.kind === 'halo') drawHalo(o, animT);
      else drawLetter(o, animT);
    });
    // zapper e missili
    zaps.forEach((z) => drawZap(z, animT));
    missiles.forEach((m) => drawMissile(m, animT));

    // personaggio (lampeggia se invincibile)
    const flick = inv > 0 && (Math.floor(animT / 4) % 2);
    if (!flick) {
      if (mode === 'cane') drawCane(PX, py, animT);
      else if (mode === 'razzo') drawRazzo(PX, py, animT);
      else if (mode === 'vino') drawVino(PX, py, animT);
      else if (mode === 'santo') drawSanto(PX, py, animT, gravDir < 0);
      else drawSaint(PX, py, state === 'run' && thrust, inv > 0, animT);
    }

    // particelle
    sparks.forEach((s) => r(s.x, s.y, 2, 2, s.c));
    // popup
    pops.forEach((p) => arcadeText(p.x, p.y, p.text, p.color, 8, Math.max(0, Math.min(1, p.life / 30))));

    // HUD parola / mezzo
    if (state === 'run' || state === 'paused') drawWordHud();

    // messaggio iniziale
    if (state === 'idle') arcadeText(W / 2, 70, 'PREMI PER VOLARE', '#f5c842', 10, 0.9);

    ctx.restore();
  }

  // ── Overlay iniziale ────────────────────────────────────────────
  function showIdleOverlay() {
    overlay.classList.remove('jp-hidden');
    if (ovKicker) ovKicker.textContent = 'Insert coin';
    ovTitle.textContent = 'San Rocco Jetpack';
    ovDesc.innerHTML = 'Vola, schiva raggi e missili, raccogli monete e <b>lettere</b>: completa una parola e ti trasformi';
    ovHint.innerHTML = 'Tieni premuto <kbd>SPAZIO</kbd>, tocca lo schermo o il tasto <kbd>SALI</kbd> per volare';
    if (playBtn) playBtn.textContent = 'Gioca';
  }
  reset();
  setPauseBtn();
  applyMute();
  showIdleOverlay();
  requestAnimationFrame(frame);
})();
