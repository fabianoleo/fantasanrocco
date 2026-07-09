/* ===================================================================
   FantaSanRocco — Radio «Onde di San Rocco» (client)
   Stazione condivisa: il server dice cosa è "in onda" e a che secondo
   (/api/radio/now). Il client si sintonizza alla posizione live, così
   tutti sentono la stessa canzone nello stesso momento. Solo Play/Stop.
   =================================================================== */
(function () {
  const audio = document.getElementById('radioAudio');
  if (!audio) return;                       // radio spenta (playlist vuota)

  const mini       = document.getElementById('radioMini');
  const miniCover  = document.getElementById('radioMiniCover');
  const miniTitle  = document.getElementById('radioMiniTitle');
  const toggleMini = document.getElementById('radioToggleMini');
  const openBtn    = document.getElementById('radioOpen');

  const modal      = document.getElementById('radioModal');
  const backdrop   = document.getElementById('radioBackdrop');
  const card       = document.getElementById('radioCard');
  const closeBtn   = document.getElementById('radioClose');
  const cover      = document.getElementById('radioCover');
  const modalTitle = document.getElementById('radioTitle');
  const barFill    = document.getElementById('radioBarFill');
  const curEl      = document.getElementById('radioCur');
  const durEl      = document.getElementById('radioDur');
  const toggleBig  = document.getElementById('radioToggle');
  const toggleLbl  = modal ? modal.querySelector('.radio-toggle-label') : null;

  let now = null;          // ultimo /api/radio/now
  let loadedSrc = null;    // src attualmente caricato nell'audio

  // ── "Chi ascolta ora": uid stabile + ping mentre si ascolta ──────
  const listenersEl = document.getElementById('radioListeners');
  const listenersN  = document.getElementById('radioListenersN');
  let uid = null;
  try {
    uid = localStorage.getItem('fsr.uid');
    if (!uid) {
      uid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      localStorage.setItem('fsr.uid', uid);
    }
  } catch (e) {}
  let pingTimer = null, pollTimer = null;
  function updateListeners(n) {
    if (!listenersEl || typeof n !== 'number') return;
    if (n > 0) { if (listenersN) listenersN.textContent = n; listenersEl.hidden = false; }
    else listenersEl.hidden = true;
  }
  function radioPing() {
    if (!uid) return;
    fetch('/api/radio/ping?uid=' + encodeURIComponent(uid), { cache: 'no-store' })
      .then(function (r) { return r.json(); }).then(function (d) { if (d) updateListeners(d.listeners); }).catch(function () {});
  }
  // Smette subito di "ascoltare": rimuove l'ascoltatore lato server.
  function radioLeave() {
    if (!uid) return;
    fetch('/api/radio/ping?uid=' + encodeURIComponent(uid) + '&leave=1', { cache: 'no-store', keepalive: true })
      .then(function (r) { return r.json(); }).then(function (d) { if (d) updateListeners(d.listeners); }).catch(function () {});
  }
  function startPinging() { if (pingTimer) return; radioPing(); pingTimer = setInterval(radioPing, 10000); }
  function stopPinging() {
    var wasPinging = !!pingTimer;
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (wasPinging) radioLeave();          // alla pausa esci subito dal conteggio
  }
  // Chiusura/uscita pagina mentre si ascolta → esci dal conteggio
  window.addEventListener('pagehide', function () { if (pingTimer) radioLeave(); });

  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  function setState(s) {
    if (mini) mini.setAttribute('data-state', s);
    if (card) card.setAttribute('data-state', s);
    if (toggleLbl) toggleLbl.textContent = (s === 'playing') ? 'Stop' : 'Ascolta';
  }

  function setMeta(d) {
    now = d;
    if (miniTitle) miniTitle.textContent = d.title;
    if (modalTitle) modalTitle.textContent = d.title;
    const cov = d.cover ? 'url("' + d.cover + '")' : '';
    if (miniCover) miniCover.style.backgroundImage = cov;
    if (cover) cover.style.backgroundImage = cov;
    if (durEl) durEl.textContent = fmt(d.duration);
    if (typeof d.listeners === 'number') updateListeners(d.listeners);
    // Media Session: traccia + controlli sulla schermata di blocco / centro di controllo
    if ('mediaSession' in navigator) {
      try {
        const art = d.cover ? [{ src: d.cover, sizes: '512x512', type: /\.png$/i.test(d.cover) ? 'image/png' : 'image/jpeg' }] : [];
        navigator.mediaSession.metadata = new MediaMetadata({ title: d.title || 'Radio San Rocco', artist: 'Radio San Rocco', album: 'FantaSanRocco', artwork: art });
        navigator.mediaSession.setActionHandler('play', function () { tuneIn(); });
        navigator.mediaSession.setActionHandler('pause', function () { tuneOut(); });
        navigator.mediaSession.setActionHandler('stop', function () { tuneOut(); });
      } catch (e) {}
    }
  }

  async function fetchNow() {
    try {
      const r = await fetch('/api/radio/now', { cache: 'no-store' });
      const d = await r.json();
      if (d && d.ok && d.playing) { d._perf = performance.now(); return d; }
    } catch (e) {}
    return null;
  }
  // Posizione "in onda" adesso (offset + tempo trascorso dal fetch, orologio monotono)
  function liveOffset(d) { return d.offset + (performance.now() - d._perf) / 1000; }

  function seekTo(d) {
    const max = (audio.duration || d.duration || 0) - 0.3;
    try { audio.currentTime = Math.max(0, Math.min(max, liveOffset(d))); } catch (e) {}
  }

  // Carica la canzone "in onda" e si posiziona live, poi (se richiesto) parte
  function loadLive(d, andPlay) {
    setMeta(d);
    const start = () => { seekTo(d); if (andPlay) audio.play().catch(() => setState('paused')); };
    if (loadedSrc !== d.src) {
      loadedSrc = d.src; audio.src = d.src;
      audio.addEventListener('loadedmetadata', start, { once: true });
      audio.load();
    } else { start(); }
  }

  async function tuneIn() {
    const d = await fetchNow();
    if (!d) return;
    loadLive(d, true);
    try { localStorage.setItem('radioOn', '1'); } catch (e) {}
  }
  function tuneOut() {
    audio.pause();
    try { localStorage.setItem('radioOn', '0'); } catch (e) {}
  }
  function toggle() { if (audio.paused) tuneIn(); else tuneOut(); }

  // API minima per altri moduli (es. il gioco che interrompe la radio e poi la riprende)
  window.FSRRadio = {
    isPlaying: function () { return !audio.paused; },
    pause: function () { if (!audio.paused) tuneOut(); },
    resume: function () { tuneIn(); },
  };

  // Lo stato UI segue lo stato reale dell'audio
  audio.addEventListener('play', () => { setState('playing'); startPinging(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
  audio.addEventListener('pause', () => { setState('paused'); stopPinging(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });

  // Avanzamento barra + tempi
  audio.addEventListener('timeupdate', () => {
    const dur = audio.duration || (now && now.duration) || 0;
    const cur = audio.currentTime || 0;
    if (barFill) barFill.style.width = (dur ? Math.min(100, cur / dur * 100) : 0) + '%';
    if (curEl) curEl.textContent = fmt(cur);
    if (dur && durEl) durEl.textContent = fmt(dur);
  });

  // Fine canzone → passa a quella "in onda" adesso (la successiva nel ciclo)
  audio.addEventListener('ended', async () => {
    const d = await fetchNow();
    if (d) loadLive(d, true);
  });

  // Correzione drift / cambio canzone ogni 15s mentre suona
  setInterval(async () => {
    if (audio.paused) return;
    const d = await fetchNow();
    if (!d) return;
    if (loadedSrc !== d.src) { loadLive(d, true); return; }
    setMeta(d);
    if (Math.abs((audio.currentTime || 0) - liveOffset(d)) > 3) seekTo(d);
  }, 15000);

  // ── Controlli ──────────────────────────────────────────────────
  if (toggleMini) toggleMini.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  if (toggleBig) toggleBig.addEventListener('click', toggle);

  // ── Popup espanso ──────────────────────────────────────────────
  async function openModal() {
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    const d = await fetchNow();
    if (d) setMeta(d);
    // aggiorna il contatore ascoltatori dal vivo mentre il modal è aperto
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => { const dd = await fetchNow(); if (dd) updateListeners(dd.listeners); }, 10000);
  }
  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }
  if (openBtn) openBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (backdrop) backdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hidden) closeModal(); });

  // ── Avvio: mostra cosa è in onda; prova a riprendere se eri sintonizzato ──
  (async () => {
    const d = await fetchNow();
    if (d) setMeta(d);
    let resume = false;
    try { resume = localStorage.getItem('radioOn') === '1'; } catch (e) {}
    if (resume && d) loadLive(d, true);   // l'autoplay può essere bloccato → resta in pausa, basta un click
  })();
})();
