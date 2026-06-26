/* =====================================================================
   STORIE — barra + visualizzatore a schermo intero (solo foto)
   Adattamento vanilla del componente React "story-viewer".
   - auto-avanzamento 5s, barre di avanzamento, tap dx/sx
   - tieni premuto = pausa, swipe = naviga/chiudi, tastiera
   - segna-visto, elimina (autore/staff), upload con auto-submit
   ===================================================================== */
(function () {
  'use strict';

  var dataEl = document.getElementById('fsrStories');
  if (!dataEl) return;

  var DATA;
  try { DATA = JSON.parse(dataEl.textContent); } catch (e) { return; }

  var users = DATA.users || [];
  var CSRF = DATA.csrf;
  var ME = DATA.me || {};
  var DURATION = 5000;

  // ── Upload: invia il form appena viene scelta una foto ──────────────
  var fileInput = document.getElementById('storyFile');
  var addForm = document.getElementById('storyAddForm');
  if (fileInput && addForm) {
    fileInput.addEventListener('change', function () {
      if (!fileInput.files || !fileInput.files.length) return;
      addForm.classList.add('is-loading');
      addForm.submit();
    });
  }

  // ── SVG inline per il modale ────────────────────────────────────────
  var SVG = {
    close: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    left: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    right: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    pause: '<svg class="ico" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    trash: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
  };

  // ── Stato ───────────────────────────────────────────────────────────
  var overlay = null, stage, barsEl, avatarEl, nameEl, timeEl, pausedEl, delBtn, mediaEl, imgEl;
  var uIndex = 0, sIndex = 0, paused = false, raf = null, startT = 0, elapsed = 0, imgReady = false;
  var holdTimer = null, held = false, downX = 0, downY = 0, moved = false;

  function fmtTime(ts) {
    var m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'adesso';
    if (m < 60) return m + 'm fa';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h fa';
    return Math.floor(h / 24) + 'g fa';
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'sv-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML =
      '<div class="sv-stage">' +
        '<div class="sv-top">' +
          '<div class="sv-bars"></div>' +
          '<div class="sv-head">' +
            '<div class="sv-user"><span class="sv-avatar"></span><span class="sv-meta"><b></b><small></small></span></div>' +
            '<div class="sv-actions">' +
              '<span class="sv-paused" hidden>' + SVG.pause + 'In pausa</span>' +
              '<button class="sv-icon-btn sv-del" hidden aria-label="Elimina storia">' + SVG.trash + '</button>' +
              '<button class="sv-icon-btn sv-close" aria-label="Chiudi">' + SVG.close + '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="sv-media"><img class="sv-img" alt=""></div>' +
        '<button class="sv-chevron sv-prev" aria-label="Precedente">' + SVG.left + '</button>' +
        '<button class="sv-chevron sv-next" aria-label="Successiva">' + SVG.right + '</button>' +
      '</div>';
    document.body.appendChild(overlay);

    stage = overlay.querySelector('.sv-stage');
    barsEl = overlay.querySelector('.sv-bars');
    avatarEl = overlay.querySelector('.sv-avatar');
    nameEl = overlay.querySelector('.sv-meta b');
    timeEl = overlay.querySelector('.sv-meta small');
    pausedEl = overlay.querySelector('.sv-paused');
    delBtn = overlay.querySelector('.sv-del');
    mediaEl = overlay.querySelector('.sv-media');
    imgEl = overlay.querySelector('.sv-img');
    imgEl.style.transition = 'opacity .2s ease';

    overlay.querySelector('.sv-close').addEventListener('click', close);
    overlay.querySelector('.sv-prev').addEventListener('click', function (e) { e.stopPropagation(); prevStory(); });
    overlay.querySelector('.sv-next').addEventListener('click', function (e) { e.stopPropagation(); nextStory(); });
    delBtn.addEventListener('click', onDelete);
    imgEl.addEventListener('load', onImgLoad);
    imgEl.addEventListener('error', hideSpinner);

    mediaEl.addEventListener('pointerdown', onDown);
    mediaEl.addEventListener('pointermove', onMove);
    mediaEl.addEventListener('pointerup', onUp);
    mediaEl.addEventListener('pointercancel', onCancel);
    // Blocca il menu contestuale (iOS/desktop) durante il tap lungo per la pausa
    mediaEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('keydown', onKey);
  }

  function showSpinner() {
    if (!mediaEl.querySelector('.sv-spinner')) {
      var s = document.createElement('div'); s.className = 'sv-spinner'; mediaEl.appendChild(s);
    }
  }
  function hideSpinner() { var s = mediaEl.querySelector('.sv-spinner'); if (s) s.remove(); }

  function setPaused(v) { paused = v; if (pausedEl) pausedEl.hidden = !v; }

  function openViewer(i) {
    if (!users.length) return;
    if (!overlay) build();
    overlay.style.display = 'flex';
    void overlay.offsetWidth;                 // forza il reflow per la transizione
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    uIndex = i;
    setPaused(false);
    renderUser();
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function renderUser() {
    var u = users[uIndex];
    if (u.avatar) avatarEl.innerHTML = '<img src="' + u.avatar + '" alt="">';
    else { avatarEl.innerHTML = ''; avatarEl.textContent = u.initials || ''; }
    nameEl.textContent = u.name;

    barsEl.innerHTML = '';
    u.stories.forEach(function () {
      var b = document.createElement('div'); b.className = 'sv-bar';
      b.innerHTML = '<div class="sv-bar-fill"></div>'; barsEl.appendChild(b);
    });
    showStory(0);
  }

  function showStory(i) {
    sIndex = i;
    var u = users[uIndex], st = u.stories[i];
    timeEl.textContent = fmtTime(st.ts);
    delBtn.hidden = !(u.id === ME.id || ME.staff);

    var fills = barsEl.querySelectorAll('.sv-bar-fill');
    for (var k = 0; k < fills.length; k++) {
      fills[k].style.transition = 'none';
      fills[k].style.width = k < i ? '100%' : '0%';
    }

    imgReady = false; elapsed = 0; startT = performance.now();
    imgEl.style.opacity = '0';
    showSpinner();
    imgEl.src = st.src;
    markSeen(st);
  }

  function onImgLoad() {
    imgReady = true;
    hideSpinner();
    imgEl.style.opacity = '1';
    startT = performance.now() - elapsed;
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    var now = performance.now();
    if (paused || !imgReady) { startT = now - elapsed; return; }
    elapsed = now - startT;
    var p = Math.min(elapsed / DURATION, 1);
    var fill = barsEl.querySelectorAll('.sv-bar-fill')[sIndex];
    if (fill) { fill.style.transition = 'width .05s linear'; fill.style.width = (p * 100) + '%'; }
    if (p >= 1) nextStory();
  }

  function nextStory() {
    var u = users[uIndex];
    if (sIndex < u.stories.length - 1) showStory(sIndex + 1);
    else if (uIndex < users.length - 1) { uIndex++; renderUser(); }
    else close();
  }
  function prevStory() {
    if (sIndex > 0) showStory(sIndex - 1);
    else if (uIndex > 0) { uIndex--; renderUser(); }
    else showStory(0);
  }

  function markSeen(st) {
    if (st.viewed) return;
    st.viewed = true;
    try {
      fetch('/api/storie/' + st.id + '/visto', {
        method: 'POST', headers: { 'X-CSRF-Token': CSRF }, credentials: 'same-origin'
      });
    } catch (e) { /* non bloccante */ }
  }

  function onDelete(e) {
    e.stopPropagation();
    var st = users[uIndex].stories[sIndex];
    if (!window.confirm('Eliminare questa storia?')) return;
    fetch('/storie/' + st.id + '/elimina', {
      method: 'POST', headers: { 'X-CSRF-Token': CSRF, 'Accept': 'application/json' }, credentials: 'same-origin'
    }).then(function () { location.reload(); }, function () { location.reload(); });
  }

  function close() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    setPaused(false);
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function () { if (overlay) overlay.style.display = 'none'; }, 200);
    syncRings();
  }

  // ── Gesti sulla zona media ──────────────────────────────────────────
  function onDown(e) {
    downX = e.clientX; downY = e.clientY; moved = false; held = false;
    holdTimer = setTimeout(function () { if (!moved) { held = true; setPaused(true); } }, 200);
    try { mediaEl.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function onMove(e) {
    if (Math.abs(e.clientX - downX) > 10 || Math.abs(e.clientY - downY) > 10) {
      moved = true;
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    }
  }
  function onUp(e) {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (held) { held = false; setPaused(false); return; }
    var dx = e.clientX - downX, dy = e.clientY - downY;
    if (Math.abs(dy) > 80 && Math.abs(dy) > Math.abs(dx)) { close(); return; }
    if (Math.abs(dx) > 40) { if (dx > 0) prevStory(); else nextStory(); return; }
    var rect = stage.getBoundingClientRect();
    if ((e.clientX - rect.left) < rect.width * 0.35) prevStory(); else nextStory();
  }
  function onCancel() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (held) { held = false; setPaused(false); }
  }

  function onKey(e) {
    if (!overlay || overlay.style.display === 'none') return;
    if (e.key === 'ArrowLeft') prevStory();
    else if (e.key === 'ArrowRight') nextStory();
    else if (e.key === 'Escape') close();
    else if (e.key === ' ') { e.preventDefault(); setPaused(!paused); }
  }

  // ── Aggiorna gli anelli della barra dopo la visione ─────────────────
  function syncRings() {
    users.forEach(function (u, i) {
      var circle = document.querySelector('.story-circle[data-user-index="' + i + '"]');
      if (!circle) return;
      var segs = circle.querySelectorAll('.sc-seg');
      var allViewed = true;
      u.stories.forEach(function (st, k) {
        if (!st.viewed) allViewed = false;
        if (segs[k]) segs[k].classList.toggle('is-viewed', !!st.viewed);
      });
      circle.classList.toggle('is-viewed', allViewed);
    });
  }

  // ── Click sui cerchi della barra ────────────────────────────────────
  var circles = document.querySelectorAll('.story-circle[data-user-index]');
  for (var c = 0; c < circles.length; c++) {
    circles[c].addEventListener('click', function () {
      openViewer(Number(this.getAttribute('data-user-index')));
    });
  }
})();
