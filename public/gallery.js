/* ===================================================================
   FantaSanRocco — Galleria Bento Interattiva (motore)
   - reveal a comparsa delle tessere
   - click su tessera → modale lightbox della SUA sottosezione
   - dock di miniature trascinabile per saltare tra le foto
   - navigazione con frecce, tastiera (←/→/Esc) e swipe
   =================================================================== */
(function () {
  const grids = document.querySelectorAll('.bento-grid');
  if (!grids.length) return;

  // ── 1. Reveal progressivo delle tessere ─────────────────────────
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items = document.querySelectorAll('.bento-item');
  if (reduce) {
    items.forEach((el) => el.classList.add('bento-in'));
  } else {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('bento-in');
        obs.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach((el) => io.observe(el));
  }

  // ── 2. Raccolta dei gruppi (una galleria per sottosezione) ──────
  const groups = {};
  items.forEach((el) => {
    const sec = el.dataset.gallery;
    (groups[sec] = groups[sec] || []).push({
      url: el.dataset.url,
      title: el.dataset.title,
      kicker: el.dataset.desc || '',
    });
  });

  // ── 3. Riferimenti modale ───────────────────────────────────────
  const modal   = document.getElementById('bentoModal');
  if (!modal) return;
  const imgEl   = modal.querySelector('.bm-img');
  const kickEl  = modal.querySelector('.bm-kicker');
  const titleEl = modal.querySelector('.bm-title');
  const dock    = document.getElementById('bmDock');
  const dockRow = dock.querySelector('.bm-dock-inner');

  let curSection = null;
  let curIndex = 0;

  function render() {
    const list = groups[curSection];
    if (!list) return;
    const it = list[curIndex];
    // ri-triggera l'animazione di entrata dell'immagine
    imgEl.style.animation = 'none';
    // eslint-disable-next-line no-unused-expressions
    imgEl.offsetWidth;
    imgEl.style.animation = '';
    imgEl.src = it.url;
    imgEl.alt = it.title;
    kickEl.textContent = it.kicker;
    titleEl.textContent = it.title;
    dockRow.querySelectorAll('.bm-thumb').forEach((t, i) => {
      t.classList.toggle('active', i === curIndex);
    });
  }

  function buildDock() {
    const list = groups[curSection];
    // rimuovi vecchie miniature (tieni l'handle)
    dockRow.querySelectorAll('.bm-thumb').forEach((t) => t.remove());
    list.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'bm-thumb';
      b.type = 'button';
      b.style.setProperty('--rot', (i % 2 === 0 ? -10 : 10) + 'deg');
      b.setAttribute('aria-label', it.title);
      const im = document.createElement('img');
      im.src = it.url; im.alt = ''; im.loading = 'lazy';
      b.appendChild(im);
      b.addEventListener('click', (e) => { e.stopPropagation(); curIndex = i; render(); });
      dockRow.appendChild(b);
    });
  }

  function open(section, index) {
    curSection = section;
    curIndex = index;
    buildDock();
    render();
    resetDockPosition();
    modal.classList.add('open');
    dock.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    modal.classList.remove('open');
    dock.classList.remove('show');
    document.body.style.overflow = '';
  }
  function step(dir) {
    const list = groups[curSection];
    if (!list) return;
    curIndex = (curIndex + dir + list.length) % list.length;
    render();
  }

  // ── 4. Apertura dalle tessere ───────────────────────────────────
  items.forEach((el) => {
    const sec = el.dataset.gallery;
    const idx = parseInt(el.dataset.index, 10) || 0;
    el.addEventListener('click', () => open(sec, idx));
  });

  // ── 5. Controlli modale ─────────────────────────────────────────
  modal.querySelector('.bm-close').addEventListener('click', close);
  modal.querySelector('.bm-prev').addEventListener('click', (e) => { e.stopPropagation(); step(-1); });
  modal.querySelector('.bm-next').addEventListener('click', (e) => { e.stopPropagation(); step(1); });
  modal.querySelector('.bm-backdrop').addEventListener('click', close);
  imgEl.addEventListener('click', () => step(1));

  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  });

  // ── 6. Swipe sull'immagine ──────────────────────────────────────
  let sx = 0, sy = 0, swiping = false;
  const fig = modal.querySelector('.bm-figure');
  fig.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; swiping = true; });
  fig.addEventListener('pointerup', (e) => {
    if (!swiping) return; swiping = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
  });

  // ── 7. Dock trascinabile ────────────────────────────────────────
  let dragging = false, dx0 = 0, dy0 = 0, px = 0, py = 0;
  function applyDock() {
    dock.style.transform = `translate(calc(-50% + ${px}px), ${py}px)`;
  }
  function resetDockPosition() { px = 0; py = 0; applyDock(); }
  dock.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.bm-thumb')) return; // i click sulle miniature restano click
    dragging = true;
    dx0 = e.clientX - px; dy0 = e.clientY - py;
    dock.setPointerCapture(e.pointerId);
  });
  dock.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    px = e.clientX - dx0; py = e.clientY - dy0;
    applyDock();
  });
  const endDrag = () => { dragging = false; };
  dock.addEventListener('pointerup', endDrag);
  dock.addEventListener('pointercancel', endDrag);
})();
