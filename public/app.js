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

// ── Visualizzatore foto (resta dentro l'app) ────────────────────────
// I link marcati data-lightbox aprono la foto in un pannello sopra la pagina
// invece di portare al file grezzo, da cui non si torna indietro. L'href resta
// valido: se il JS non parte, il link funziona comunque come prima.
// Con data-group più foto formano un gruppo e si alternano nella STESSA
// posizione — è così che si confrontano due immagini quasi uguali.
(function () {
  var overlay = null, img = null, didascalia = null, contatore = null, frecce = null;
  var gruppo = [], indice = 0, scrollBloccato = 0, aperto = false;

  function costruisci() {
    overlay = document.createElement('div');
    overlay.className = 'lb';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<button type="button" class="lb-close" aria-label="Chiudi">&times;</button>' +
      '<div class="lb-stage"><img class="lb-img" alt=""></div>' +
      '<div class="lb-bar">' +
        '<button type="button" class="lb-nav lb-prev" aria-label="Foto precedente">&#8249;</button>' +
        '<p class="lb-cap"></p>' +
        '<button type="button" class="lb-nav lb-next" aria-label="Foto successiva">&#8250;</button>' +
      '</div>' +
      '<p class="lb-count"></p>';
    document.body.appendChild(overlay);
    img = overlay.querySelector('.lb-img');
    didascalia = overlay.querySelector('.lb-cap');
    contatore = overlay.querySelector('.lb-count');
    frecce = overlay.querySelectorAll('.lb-nav');

    overlay.querySelector('.lb-close').addEventListener('click', chiudi);
    overlay.addEventListener('click', function (e) {
      // clic sullo sfondo (non sull'immagine né sui comandi) → chiude
      if (e.target === overlay || e.target.classList.contains('lb-stage')) chiudi();
    });
    // Toccare la foto alterna fra le immagini del gruppo: il confronto si fa così
    img.addEventListener('click', function (e) { e.stopPropagation(); if (gruppo.length > 1) vai(1); });
    overlay.querySelector('.lb-prev').addEventListener('click', function (e) { e.stopPropagation(); vai(-1); });
    overlay.querySelector('.lb-next').addEventListener('click', function (e) { e.stopPropagation(); vai(1); });
  }

  function mostra() {
    var l = gruppo[indice];
    img.src = l.getAttribute('href');
    img.alt = l.getAttribute('data-caption') || 'Foto';
    didascalia.textContent = l.getAttribute('data-caption') || '';
    var piuDiUna = gruppo.length > 1;
    contatore.textContent = piuDiUna ? 'Tocca la foto per confrontare · ' + (indice + 1) + '/' + gruppo.length : '';
    for (var i = 0; i < frecce.length; i++) frecce[i].hidden = !piuDiUna;
  }
  function vai(d) {
    indice = (indice + d + gruppo.length) % gruppo.length;
    mostra();
  }

  function apri(link) {
    if (!overlay) costruisci();
    var g = link.getAttribute('data-group');
    gruppo = g ? [].slice.call(document.querySelectorAll('[data-lightbox][data-group="' + g + '"]')) : [link];
    indice = Math.max(0, gruppo.indexOf(link));
    mostra();

    scrollBloccato = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + scrollBloccato + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    overlay.classList.add('is-open');
    aperto = true;
    // Una voce nella cronologia: sul telefono il gesto "indietro" chiude la
    // foto invece di far uscire dalla pagina.
    try { history.pushState({ lb: 1 }, ''); } catch (e) {}
  }

  function chiudi(daPopstate) {
    if (!aperto) return;
    aperto = false;
    overlay.classList.remove('is-open');
    img.src = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo({ top: scrollBloccato, behavior: 'instant' });
    // Se chiudiamo noi (X, sfondo, Esc) togliamo la voce che avevamo aggiunto.
    if (daPopstate !== true) { try { history.back(); } catch (e) {} }
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[data-lightbox]');
    if (!link) return;
    e.preventDefault();
    apri(link);
  });
  document.addEventListener('keydown', function (e) {
    if (!aperto) return;
    if (e.key === 'Escape') chiudi();
    else if (e.key === 'ArrowRight' && gruppo.length > 1) vai(1);
    else if (e.key === 'ArrowLeft' && gruppo.length > 1) vai(-1);
  });
  window.addEventListener('popstate', function () { if (aperto) chiudi(true); });
})();

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
  function showPanel(id) {
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.target === id));
    document.querySelectorAll('.lb-panel').forEach((p) => {
      p.classList.toggle('lb-panel-active', p.id === id);
    });
  }
  tabs.forEach((tab) => tab.addEventListener('click', () => showPanel(tab.dataset.target)));
  // Link interni che rimandano a un'altra tab (es. "classifica generale")
  document.querySelectorAll('.lb-golink[data-target]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      showPanel(a.dataset.target);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
})();

// ── Classifica: sotto-tab dei due mini-giochi ───────────────────────
(function () {
  const subtabs = document.querySelectorAll('.lb-subtab');
  if (!subtabs.length) return;
  subtabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      subtabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.lb-subpanel').forEach((p) => {
        p.classList.toggle('lb-subpanel-active', p.id === tab.dataset.target);
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

// ── Barra in basso: sta ferma, incollata al fondo di quello che si vede ──
// Prima si nascondeva scorrendo giù e riappariva scorrendo su. Sul telefono
// era un disastro: bastava un tremolio del dito di quattro pixel — misurato —
// perché `y > lastY` diventasse vero, la barra scivolasse fuori e NON tornasse
// finché non si scorreva su di proposito. La navigazione principale del
// telefono spariva mentre si stava solo leggendo la classifica.
//
// Adesso non si muove più allo scroll. Resta solo il problema per cui è nata:
// su iOS `position: fixed; bottom: 0` si aggancia al viewport di LAYOUT, che
// non coincide col pezzo di schermo davvero visibile quando la barra degli
// indirizzi si apre o si chiude. Il risultato è la barra che si stacca dal
// fondo e galleggia in mezzo al contenuto. Qui la riagganciamo al viewport
// VISUALE, che è l'unico che sa dove finisce lo schermo per davvero.
(function () {
  const nav = document.getElementById('bottomNav');
  if (!nav) return;

  const vv = window.visualViewport;
  if (!vv) return;            // senza, `bottom: 0` del CSS va già benissimo

  // Oltre questo scarto non è più la barra del browser che si apre: è la
  // tastiera. Lì la barra deve restare dov'è (sotto la tastiera, fuori dai
  // piedi) invece di salire a coprire il campo in cui si sta scrivendo.
  const TASTIERA = 120;

  let inCoda = false;

  function ancora() {
    inCoda = false;
    const fondoVisibile = vv.offsetTop + vv.height;
    const fondoLayout = document.documentElement.clientHeight;
    const scarto = fondoVisibile - fondoLayout;
    // Sotto il pixel non vale la pena scrivere nulla: eviterebbe solo di
    // sporcare lo stile inline a ogni evento di scroll.
    if (Math.abs(scarto) < 1 || scarto < -TASTIERA) nav.style.transform = '';
    else nav.style.transform = 'translateY(' + Math.round(scarto) + 'px)';
  }

  function programma() {
    if (inCoda) return;
    inCoda = true;
    requestAnimationFrame(ancora);
  }

  vv.addEventListener('resize', programma);
  vv.addEventListener('scroll', programma);
  ancora();
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
  // Anche sul singolo PULSANTE: serve ai form con due invii che fanno cose
  // opposte — dare o togliere punti — dove la domanda giusta dipende da quale
  // dei due si preme, e una sola sul form non potrebbe dirlo.
  // Si annulla il click e non l'invio, perche' e' il click a scegliere: e non
  // si reinvia mai il form da codice, altrimenti il name/value del pulsante
  // premuto non arriverebbe al server e "Togli" darebbe punti invece di
  // toglierli.
  document.querySelectorAll('button[data-confirm]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      if (!window.confirm(b.getAttribute('data-confirm'))) e.preventDefault();
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

// ── Pulsante Aggiorna ───────────────────────────────────────────────
// Nell'app installata non c'è la barra del browser, quindi non esiste né il
// pulsante di ricarica né il "tira giù per aggiornare": senza questo, per
// vedere le storie nuove bisognava chiudere e riaprire l'app.
//
// location.reload() basta e avanza: il service worker serve le pagine SEMPRE
// dalla rete (vedi il commento in sw.js), quindi quello che torna è fresco.
// Gli statici restano dalla cache, ed è giusto — cambiano solo col ?v=.
(function () {
  'use strict';
  var btn = document.getElementById('navRefresh');
  if (!btn) return;
  btn.addEventListener('click', function () {
    btn.classList.add('is-loading');
    // La rotellina deve fare in tempo a comparire: senza un giro di rendering
    // il reload parte prima che il browser abbia disegnato qualcosa, e chi
    // preme non vede nessuna reazione.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { window.location.reload(); });
    });
  });
})();
