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
  let px, target, dist, bonus, score, inv, items, popups, fx, spawnT, coinT, haloT, animT, last, shake, reported;
  let keyL = false, keyR = false, pointerX = null, overTimer = null;

  function reset() {
    px = (W - PW) / 2; target = px;
    dist = 0; bonus = 0; score = 0; inv = 0;
    items = []; popups = []; fx = [];
    spawnT = 60; coinT = 120; haloT = 1500; animT = 0; shake = 0; reported = false; pointerX = null;
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
    reset(); state = 'run'; hideOverlay(); arcadeFlash('VIA!');
  }
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (/input|textarea/i.test(tag || '')) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keyL = true; if (state !== 'run') start(); e.preventDefault(); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { keyR = true; if (state !== 'run') start(); e.preventDefault(); }
    else if (e.code === 'Space' || e.code === 'Enter') { if (state !== 'run') start(); e.preventDefault(); }
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
    if (state !== 'run') { start(); return; }
    pointerX = canvasX(e.clientX);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => { if (pointerX !== null) pointerX = canvasX(e.clientX); });
  const drop = () => { pointerX = null; };
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);

  // Controller mobile: pulsanti ◀ ▶ da tenere premuti
  function holdButton(btn, set) {
    if (!btn) return;
    const press = (e) => { e.preventDefault(); if (state !== 'run') start(); set(true); try { btn.setPointerCapture(e.pointerId); } catch (_) {} };
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

  function hideOverlay() { overlay.classList.add('gm-hidden'); }
  function showOverlay(mode, sc) {
    overlay.classList.remove('gm-hidden');
    if (mode === 'idle') {
      ovTitle.textContent = 'Corri San Rocco';
      ovScore.innerHTML = 'Schiva torce e bombe, raccogli le monete d\'oro';
      ovHint.innerHTML = 'Usa <kbd>←</kbd> <kbd>→</kbd> o trascina per spostarti';
      if (playBtn) playBtn.textContent = 'Gioca';
    } else {
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
    r(250, 16, 12, 12, '#f3ecd0'); r(248, 18, 12, 8, '#0a0a1e');
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
      dist += (1.9 + diff * 1.4) * dt;
      if (inv > 0) inv -= dt;

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

      // caduta + interazioni
      const pbox = { x: px + 3, y: GROUND - 30, w: PW - 6, h: 28 };
      const grab = { x: px - 4, y: GROUND - 34, w: PW + 8, h: 34 };  // raggio di raccolta più ampio
      for (let i = items.length - 1; i >= 0; i--) {
        const o = items[i];
        const sp = o.kind === 'hit' ? fallSpeed + o.vs : fallSpeed * 0.8 + o.vs;
        o.y += sp * dt;
        const cx = o.x + o.w / 2, cy = o.y + o.h / 2;

        if (o.kind === 'coin') {
          if (overlap(grab, o)) { bonus += 15; popup(cx, o.y, '+15', '#f5c842'); burst(cx, cy, '#f5c842'); items.splice(i, 1); continue; }
          if (o.y > GROUND - 2) { items.splice(i, 1); continue; }
        } else if (o.kind === 'halo') {
          if (overlap(grab, o)) { inv = 260; popup(cx, o.y, 'AUREOLA!', '#fff7d0', 9); arcadeFlash('BONUS!'); burst(cx, cy, '#f5c842'); items.splice(i, 1); continue; }
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

    elScore.textContent = score;
  }

  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  function gameOver() {
    state = 'over'; shake = 7; inv = 0;
    burst(px + PW / 2, GROUND - 14, '#e84e1b');
    if (score > best) best = score;
    elBest.textContent = 'record ' + best;
    arcadeFlash('GAME OVER');
    if (logged && !reported) { reported = true; report(score); }
    overTimer = setTimeout(() => showOverlay('over', score), 700);
  }

  // ── Invio punteggio + traguardi (invariato) ─────────────────────
  function report(sc) {
    fetch('/gioco/punteggio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ score: String(sc), _csrf: csrf }),
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
