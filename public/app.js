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

// ── Scroll Reveal (IntersectionObserver) ────────────────────────────
(function () {
  const els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const delay = (parseInt(el.dataset.delay, 10) || 0) * 135;
      setTimeout(() => el.classList.add('is-visible'), delay);
      io.unobserve(el);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -48px 0px' });

  els.forEach((el) => io.observe(el));
})();

// ── Manifesto pin ───────────────────────────────────────────────────
(function () {
  const wrap = document.getElementById('manifestoWrap');
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

// ── Hide scroll hint on first scroll ────────────────────────────────
(function () {
  const hint = document.getElementById('scrollHint');
  if (!hint) return;
  const hide = () => { hint.style.opacity = '0'; hint.style.transition = 'opacity .5s'; };
  window.addEventListener('scroll', hide, { once: true, passive: true });
})();
