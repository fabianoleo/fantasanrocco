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
  }, { passive: true });
})();

// ── Utenti online (polling ogni 30s) ────────────────────────────────
(function () {
  const el = document.getElementById('onlineCount');
  if (!el) return;

  async function refresh() {
    try {
      const res = await fetch('/api/online');
      const { count } = await res.json();
      el.textContent = count;
      el.closest('.online-pill').style.color = count > 0 ? '' : '';
    } catch { /* ignora errori di rete */ }
  }

  refresh();
  setInterval(refresh, 30_000);
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
