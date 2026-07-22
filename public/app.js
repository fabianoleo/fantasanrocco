// ── Form double-submit guard ────────────────────────────────────────
document.addEventListener('submit', (e) => {
  const btn = e.target.querySelector('button[type=submit]');
  if (btn) setTimeout(() => { btn.disabled = true; btn.style.opacity = '.6'; }, 0);
});

// ── Copy invite link ────────────────────────────────────────────────
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.copy-btn');
  if (!btn) return;
  const text = btn.getAttribute('data-copy');
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = 'Copiato!';
    setTimeout(() => { btn.textContent = old; }, 1500);
  } catch (_) {
    const input = btn.closest('.invite-row')?.querySelector('.invite-link');
    if (input) input.select();
    else alert('Copia manualmente il link.');
  }
});

// ── Feedback aptico (vibrazione) ────────────────────────────────────
// Funziona su Android (browser e web app installata). Su iPhone l'API non
// esiste: la guardia fa sì che non succeda nulla, senza errori. Pattern
// corti = "tocco" secco, non ronzio da sveglia.
window.fsrVibra = function (pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* niente */ }
};
// I bottoni marcati data-haptic danno un colpetto al tocco. Il click parte
// PRIMA che la pagina cambi, quindi funziona anche sui form che navigano.
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-haptic]')) window.fsrVibra(15);
});

// ── Hamburger / Mobile menu ─────────────────────────────────────────
(function () {
  const hamburger = document.getElementById('hamburger');
  const menu      = document.getElementById('mobileMenu');
  const closeBtn  = document.getElementById('mmClose');
  if (!hamburger || !menu) return;

  // Blocco della pagina sotto al menu. Su iOS `body { overflow: hidden }` non
  // basta: il dito continua a trascinare la pagina dietro. L'unico modo
  // affidabile è togliere il body dal flusso con position:fixed, ricordando a
  // che altezza eravamo per rimetterlo lì alla chiusura.
  let scrollBloccato = 0;
  function bloccaPagina() {
    scrollBloccato = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollBloccato}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
  }
  function sbloccaPagina() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    // 'instant': senza questo lo scroll-behavior smooth farebbe risalire la
    // pagina con un'animazione visibile invece di rimetterla dov'era.
    window.scrollTo({ top: scrollBloccato, behavior: 'instant' });
  }

  function openMenu() {
    hamburger.classList.add('is-open');
    hamburger.setAttribute('aria-expanded', 'true');
    menu.classList.add('is-open');
    menu.setAttribute('aria-hidden', 'false');
    menu.scrollTop = 0;          // il menu si riapre sempre dall'inizio
    bloccaPagina();
  }

  function closeMenu() {
    if (!menu.classList.contains('is-open')) return;
    hamburger.classList.remove('is-open');
    hamburger.setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
    sbloccaPagina();
  }

  hamburger.addEventListener('click', () => {
    hamburger.classList.contains('is-open') ? closeMenu() : openMenu();
  });

  if (closeBtn) closeBtn.addEventListener('click', closeMenu);

  // Close when a link inside the menu is tapped
  menu.querySelectorAll('.mm-link').forEach(link => {
    link.addEventListener('click', closeMenu);
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
})();

// ── Classifica: tab Generale / Gioco ────────────────────────────────
(function () {
  const tabs = document.querySelectorAll('.lb-tab');
  if (!tabs.length) return;
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.lb-panel').forEach((p) => {
        p.classList.toggle('lb-panel-active', p.id === tab.dataset.target);
      });
    });
  });
})();

// ── Scroll Reveal (IntersectionObserver) ────────────────────────────
(function () {
  const els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el    = entry.target;
      const delay = (parseInt(el.dataset.delay, 10) || 0) * 135;
      setTimeout(() => el.classList.add('is-visible'), delay);
      io.unobserve(el);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -48px 0px' });

  els.forEach((el) => io.observe(el));
})();

// ── Manifesto pin ───────────────────────────────────────────────────
(function () {
  const wrap  = document.getElementById('manifestoWrap');
  const words = document.querySelectorAll('.mw');
  const body  = document.getElementById('manifestoBody');
  if (!wrap || !words.length) return;

  let current = 0;

  function setWord(idx) {
    if (idx === current) return;
    words[current].classList.remove('mw-active');
    words[current].classList.add('mw-exit');
    const prev = current;
    setTimeout(() => words[prev].classList.remove('mw-exit'), 580);
    current = idx;
    words[current].classList.add('mw-active');
  }

  window.addEventListener('scroll', () => {
    const { top } = wrap.getBoundingClientRect();
    const scrolled = -top;
    const total    = wrap.offsetHeight - window.innerHeight;
    if (scrolled < 0 || scrolled > total + window.innerHeight) return;

    const progress = Math.max(0, Math.min(1, scrolled / total));
    const idx = Math.min(words.length - 1, Math.floor(progress * words.length));
    setWord(idx);

    if (body) {
      if (progress > 0.62) body.classList.add('mb-visible');
      else body.classList.remove('mb-visible');
    }
    const hint = document.getElementById('manifestoScrollHint');
    if (hint) {
      if (progress > 0.05 && progress < 0.90) hint.classList.add('ms-visible');
      else hint.classList.remove('ms-visible');
    }
  }, { passive: true });
})();

// ── Utenti online — ping ogni 15s + SSE per aggiornamenti ───────────
(function () {
  const pill = document.getElementById('onlinePill');
  const wrap = pill && pill.querySelector('.oc-wrap');
  if (!pill || !wrap) return;

  let current = null;
  let sseWorking = false;
  let pollTimer = null;

  // UUID stabile per dispositivo — non cambia con login/logout/refresh
  let _uid = localStorage.getItem('fsr.uid');
  if (!_uid) {
    _uid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    localStorage.setItem('fsr.uid', _uid);
  }

  function sendPing() {
    if (document.visibilityState === 'hidden') return;
    fetch('/api/online/ping?uid=' + _uid).catch(() => {});
  }
  sendPing();
  setInterval(sendPing, 6_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sendPing();
  });

  function setCount(n) {
    if (typeof n !== 'number' || isNaN(n)) return;
    const el = wrap.querySelector('.oc-val');
    if (!el) return;

    if (current === null) {
      el.textContent = n;
      current = n;
      return;
    }
    if (n === current) return;

    const goUp = n > current; // numero sale → vecchio esce in alto, nuovo entra dal basso
    current = n;

    // Flash verde sul pill
    pill.classList.remove('oc-flash');
    void pill.offsetWidth;
    pill.classList.add('oc-flash');

    // Esce
    el.animate(
      [{ transform: 'translateY(0)', opacity: 1 },
       { transform: `translateY(${goUp ? '-' : ''}110%)`, opacity: 0 }],
      { duration: 180, easing: 'ease-in', fill: 'forwards' }
    ).onfinish = () => {
      el.textContent = n;
      // Entra dal lato opposto
      el.animate(
        [{ transform: `translateY(${goUp ? '' : '-'}110%)`, opacity: 0 },
         { transform: 'translateY(0)', opacity: 1 }],
        { duration: 220, easing: 'ease-out', fill: 'forwards' }
      ).onfinish = () => { el.style.cssText = ''; };
    };
  }

  // Fallback: polling ogni 4s se SSE non funziona
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      try {
        const r = await fetch('/api/online');
        const { count } = await r.json();
        setCount(count);
      } catch {}
    }, 4000);
    // Prima lettura immediata
    fetch('/api/online').then(r => r.json()).then(({ count }) => setCount(count)).catch(() => {});
  }

  // Attendi 8s: se SSE non ha ancora risposto, avvia polling
  const sseTimeout = setTimeout(() => {
    if (!sseWorking) startPolling();
  }, 8000);

  function connect() {
    const es = new EventSource('/api/online/stream');
    es.onmessage = (e) => {
      try {
        const { count } = JSON.parse(e.data);
        sseWorking = true;
        clearTimeout(sseTimeout);
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        setCount(count);
      } catch {}
    };
    es.onerror = () => {
      es.close();
      setTimeout(connect, 5000);
    };
  }

  connect();
})();

// ── Indizio di scroll ────────────────────────────────────────────────
// NON lo nascondiamo via JS: sta dentro .hero-text-wrapper, che GSAP sfuma
// e fa sparire man mano che scorri. Nasconderlo "al primo scroll" era
// fragile — lo scroll "fantasma" che ScrollTrigger genera all'init lo
// faceva sparire subito. Ora resta visibile a riposo e svanisce scrollando.

// ── Bottom nav: hide on scroll down, show on scroll up ──────────────
(function () {
  const nav = document.getElementById('bottomNav');
  if (!nav) return;
  let lastY = window.scrollY;

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y > lastY && y > 80) {
      // +28px: il cerchio GIOCO sporge 24px sopra la barra (più l'ombra),
      // col solo 100% il suo arco restava a spuntare dal bordo dello schermo
      nav.style.transform = 'translateY(calc(100% + 28px))';
      nav.style.transition = 'transform .3s var(--ease)';
    } else {
      nav.style.transform = 'translateY(0)';
    }
    lastY = y;
  }, { passive: true });
})();

// ── Banner prudenza (una volta per sessione) ─────────────────────
(function () {
  const overlay = document.getElementById('safetyOverlay');
  if (!overlay) return;

  if (sessionStorage.getItem('fsr-safety-ok')) {
    overlay.remove();
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add('safety-visible'));
  });

  document.getElementById('safetyAccept').addEventListener('click', () => {
    sessionStorage.setItem('fsr-safety-ok', '1');
    overlay.classList.remove('safety-visible');
    setTimeout(() => overlay.remove(), 480);
  });
})();

// ── Footer: comparsa in blur quando entra in viewport ────────────────
(function () {
  const footer = document.querySelector('.site-footer');
  if (!footer) return;

  const reveal = () => footer.classList.add('foot-reveal');

  if (!('IntersectionObserver' in window)) { reveal(); return; }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { reveal(); io.disconnect(); }
    });
  }, { threshold: 0.12 });
  io.observe(footer);

  // Rete di sicurezza: non lasciare mai le colonne invisibili
  setTimeout(reveal, 1600);
})();

// ── Conferma prima di inviare i form con data-confirm (globale) ──────
// (La CSP blocca gli onsubmit inline → serve un handler in JS esterno.)
(function () {
  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      if (!window.confirm(f.getAttribute('data-confirm'))) e.preventDefault();
    });
  });
})();

// ── Pronostico Palio: evidenzia la scelta attuale e "sbiadisce" la precedente ──
// Quando l'utente cambia scelta, la nuova opzione va in fuoco e quella salvata
// in precedenza diventa "in uscita" (grigia/sbarrata), per far capire che verrà
// sostituita solo dopo la conferma.
(function () {
  var forms = Array.prototype.slice.call(document.querySelectorAll('.prono-form'));
  if (!forms.length) return;
  forms.forEach(function (form) {
    var savedAttr = form.getAttribute('data-saved');
    var saved = (savedAttr === null || savedAttr === '') ? null : parseInt(savedAttr, 10);
    var opts = Array.prototype.slice.call(form.querySelectorAll('.prono-opt'));
    function sync() {
      opts.forEach(function (o, i) {
        var checked = o.querySelector('input').checked;
        o.classList.toggle('is-current', checked);
        o.classList.toggle('is-outgoing', saved !== null && i === saved && !checked);
      });
    }
    form.addEventListener('change', sync);
    sync();
  });
})();

// ── Storia: timeline con linea che si riempie mentre si scorre ──────────
// Ricrea l'effetto scroll-driven (stile Aceternity) in vanilla JS. Attivo
// solo dove esiste #stTimeline. Progresso mappato come offset "start 10%"..
// "end 50%": la linea parte quando la timeline entra e si completa uscendo.
(function () {
  var tl = document.getElementById('stTimeline');
  var fill = document.getElementById('stTlFill');
  if (!tl || !fill) return;
  var rail = tl.querySelector('.st-tl-rail');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { fill.style.height = '100%'; return; }
  fill.style.transition = 'height .1s linear';

  function update() {
    var rect = tl.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    // p=0 quando il top è al 10% del viewport, p=1 quando il bottom è al 50%
    var denom = rect.height - 0.4 * vh;
    var p = denom > 0 ? (0.1 * vh - rect.top) / denom : 0;
    p = Math.max(0, Math.min(1, p));
    fill.style.height = (p * (rail ? rail.offsetHeight : rect.height)) + 'px';
  }
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { update(); ticking = false; });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();
