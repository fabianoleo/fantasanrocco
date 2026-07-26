/* ===================================================================
   FantaSanRocco — Sezione «Giochi e Slot»
   Una riga con 3 scelte; sotto compare il gioco selezionato.
   All'inizio nessun gioco è attivo: si vede l'invito animato.

   Gli script dei giochi vengono caricati SOLO alla prima apertura della
   scheda: così non girano tre loop di animazione insieme e la pagina
   resta leggera anche su telefono.
   =================================================================== */
(function () {
  const sw = document.getElementById('gxSwitch');
  const stage = document.getElementById('gxStage');
  const empty = document.getElementById('gxEmpty');
  if (!sw || !stage) return;

  const choices = Array.from(sw.querySelectorAll('.gx-choice'));
  const loaded = Object.create(null);      // gioco → script già caricati?

  function panelOf(game) { return document.getElementById('gxp-' + game); }

  // Carica gli script del pannello la prima volta che lo si apre
  function loadScripts(game, panel) {
    if (loaded[game]) return;
    loaded[game] = true;
    const list = (panel.dataset.scripts || '').split(',').map((s) => s.trim()).filter(Boolean);
    list.forEach((src) => {
      const el = document.createElement('script');
      el.src = src;
      el.defer = false;                    // ordine garantito: li aggiungiamo in sequenza
      document.body.appendChild(el);
    });
  }

  function select(game, opts) {
    opts = opts || {};
    const panel = panelOf(game);
    if (!panel) return;

    choices.forEach((c) => {
      const on = c.dataset.game === game;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    Array.from(stage.querySelectorAll('.gx-panel')).forEach((p) => { p.hidden = p !== panel; });
    if (empty) empty.hidden = true;

    loadScripts(game, panel);

    // Ricordiamo la scelta e teniamo l'indirizzo condivisibile
    try { localStorage.setItem('fsr.gioco', game); } catch (e) {}
    if (!opts.silent) {
      const u = new URL(window.location.href);
      u.searchParams.set('g', game);
      history.replaceState(null, '', u);
    }
    // Su telefono porta la vista sul gioco appena scelto
    if (opts.scroll !== false && window.innerWidth < 720) {
      stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  choices.forEach((c) => {
    c.addEventListener('click', (e) => { e.preventDefault(); select(c.dataset.game); });
  });

  // Apertura diretta: ?g=slot (dai vecchi link /slot e /gioco)
  const wanted = new URLSearchParams(window.location.search).get('g');
  if (wanted && panelOf(wanted)) select(wanted, { silent: true, scroll: false });
  // Altrimenti si resta sull'invito animato: la scelta è dell'utente.
})();
