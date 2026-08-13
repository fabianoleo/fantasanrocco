/* ===================================================================
   FantaSanRocco — «Sbircia» le sfide speciali
   Toglie il velo dalle sfide non ancora uscite. È una lente, non una
   pubblicazione: scopre le carte solo nella pagina di chi preme, e
   ricaricando tornano coperte. Non tocca niente sul server.

   Il pulsante esiste solo nelle pagine dello staff — è il server a
   decidere se stamparlo, e solo lì manda anche i testi da scoprire.
   Per tutti gli altri le sfide coperte non hanno proprio contenuto
   nell'HTML, quindi non c'è niente da svelare nemmeno smanettando.
   =================================================================== */
(function () {
  'use strict';

  const bottone = document.querySelector('[data-ms-sbircia]');
  if (!bottone) return;

  const etichetta = bottone.querySelector('.ms-sbircia-txt');

  bottone.addEventListener('click', function () {
    const scoperto = document.body.classList.toggle('ms-svelato');
    bottone.setAttribute('aria-pressed', scoperto ? 'true' : 'false');
    if (etichetta) etichetta.textContent = scoperto ? 'Ricopri' : 'Sbircia';
  });
})();

// ── RICERCA FRA LE MISSIONI ─────────────────────────────────────────────
// Le card sono già tutte in pagina: cercare lato browser evita un giro al
// server e non fa perdere il punto in cui si era arrivati scorrendo.
//
// Le missioni COPERTE non entrano nella ricerca e non spariscono mai: il loro
// testo non è nell'HTML (è nascosto apposta ai giocatori), quindi non si può
// cercarle — e farle sparire mentre si cerca direbbe quante ne mancano in un
// giorno, che è proprio la sorpresa da non rovinare.
//
// Le intestazioni sono su DUE livelli: la sezione ("Sfide speciali") raggruppa
// più giornate, ognuna con la sua griglia. La giornata si nasconde quando la
// sua griglia resta vuota; la sezione solo quando sono vuote tutte le sue,
// altrimenti sparirebbe il titolo con ancora dei risultati sotto.
//
// I contatori delle giornate seguono la ricerca: lasciare "12" sopra una
// giornata che ne mostra due sarebbe una bugia scritta grande.
(function () {
  'use strict';
  var barra = document.querySelector('[data-ms-barra]');
  if (!barra) return;
  var campo = barra.querySelector('[data-ms-cerca]');
  var esito = barra.querySelector('[data-ms-esito]');
  var griglie = Array.prototype.slice.call(document.querySelectorAll('.mission-grid'));
  if (!griglie.length) return;

  // Si prepara UNA volta sola: cercare nel DOM a ogni tasto premuto costerebbe
  // più della ricerca stessa.
  function sezioneDi(el) {
    var p = el;
    while (p) { if (p.classList && p.classList.contains('ms-sechead')) return p; p = p.previousElementSibling; }
    return null;
  }
  var blocchi = griglie.map(function (griglia) {
    var prec = griglia.previousElementSibling;
    var giorno = (prec && prec.classList.contains('ms-giorno')) ? prec : null;
    var numero = giorno ? giorno.querySelector('.ms-giorno-n') : null;
    return {
      griglia: griglia,
      giorno: giorno,
      numero: numero,
      totale: numero ? numero.textContent : null,
      sezione: sezioneDi(griglia),
      cards: Array.prototype.slice.call(griglia.querySelectorAll('.mission-card')),
    };
  });
  var sezioni = [];
  blocchi.forEach(function (b) { if (b.sezione && sezioni.indexOf(b.sezione) === -1) sezioni.push(b.sezione); });

  function mostra(el, visibile) {
    if (el && el.hidden === visibile) el.hidden = !visibile;
  }

  function filtra() {
    var q = (campo.value || '').trim().toLowerCase();
    var trovate = 0;
    var pienePerSezione = new Map();

    blocchi.forEach(function (b) {
      var visibili = 0;
      b.cards.forEach(function (c) {
        // Senza data-cerca è una missione coperta: resta com'è.
        var testo = c.getAttribute('data-cerca');
        if (testo === null) { visibili++; return; }
        var ok = !q || testo.indexOf(q) !== -1;
        // Si scrive solo quando lo stato cambia davvero: con centinaia di card
        // toccarle tutte a ogni tasto premuto fa ricalcolare il layout ogni volta.
        if (c.hidden !== !ok) c.hidden = !ok;
        if (ok) { visibili++; trovate++; }
      });
      mostra(b.griglia, visibili > 0);
      mostra(b.giorno, visibili > 0);
      if (b.numero) b.numero.textContent = q ? String(visibili) : b.totale;
      if (b.sezione) pienePerSezione.set(b.sezione, (pienePerSezione.get(b.sezione) || 0) + visibili);
    });

    sezioni.forEach(function (s) { mostra(s, (pienePerSezione.get(s) || 0) > 0); });

    if (!q) { esito.hidden = true; return; }
    esito.hidden = false;
    esito.textContent = trovate
      ? trovate + (trovate === 1 ? ' missione trovata' : ' missioni trovate')
      : 'Nessuna missione per \u00ab' + campo.value.trim() + '\u00bb. Le sfide ancora coperte non si possono cercare.';
  }

  campo.addEventListener('input', filtra);
  // La "x" del campo di ricerca su iOS non fa scattare 'input' in tutte le
  // versioni: senza questo la lista resterebbe filtrata a campo vuoto.
  campo.addEventListener('search', filtra);
})();
