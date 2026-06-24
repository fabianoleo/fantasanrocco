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

// ── Hamburger / Mobile menu ─────────────────────────────────────────
(function () {
  const hamburger = document.getElementById('hamburger');
  const menu      = document.getElementById('mobileMenu');
  const closeBtn  = document.getElementById('mmClose');
  if (!hamburger || !menu) return;

  function openMenu() {
    hamburger.classList.add('is-open');
    hamburger.setAttribute('aria-expanded', 'true');
    menu.classList.add('is-open');
    menu.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    hamburger.classList.remove('is-open');
    hamburger.setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
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

// ── Hide scroll hint on first scroll ────────────────────────────────
(function () {
  const hint = document.getElementById('scrollHint');
  if (!hint) return;
  window.addEventListener('scroll', () => {
    hint.style.transition = 'opacity .5s';
    hint.style.opacity = '0';
  }, { once: true, passive: true });
})();

// ── Bottom nav: hide on scroll down, show on scroll up ──────────────
(function () {
  const nav = document.getElementById('bottomNav');
  if (!nav) return;
  let lastY = window.scrollY;

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y > lastY && y > 80) {
      nav.style.transform = 'translateY(100%)';
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
