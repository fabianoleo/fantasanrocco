/* ===================================================================
   Admin — dashboard hub + QR premio.
   • Navigazione hub↔pannelli: la home mostra le tile; al clic si apre il
     singolo pannello (gli altri restano nascosti). Deep-link via hash
     (#missioni…) → back del browser e link condivisibili funzionano.
   • QR premio: scarica come PNG o copia l'immagine negli appunti.
   L'SVG del QR viene disegnato su un canvas e convertito in PNG.
   =================================================================== */
// (La conferma dei form data-confirm è ora gestita globalmente in app.js.)

// ── Dashboard: hub ↔ pannelli ──────────────────────────────────────
(function () {
  'use strict';
  var hub = document.getElementById('admHub');
  if (!hub) return;
  var panels = Array.prototype.slice.call(document.querySelectorAll('.adm-panel'));
  var tiles = Array.prototype.slice.call(document.querySelectorAll('.adm-tile[data-panel]'));

  function panelEl(key) { return document.getElementById('p-' + key); }

  // Fa partire l'animazione di entrata. La classe si toglie a fine corsa,
  // altrimenti riaprendo lo stesso pannello non ripartirebbe.
  var primoGiro = true;
  var animTimer = 0;
  function pulisci(el) { el.classList.remove('adm-anim-in', 'adm-anim-back'); }
  function anima(el, classe) {
    if (primoGiro) return;                  // al caricamento della pagina niente animazione
    pulisci(el);
    void el.offsetWidth;                    // forza il riavvio dell'animazione
    el.classList.add(classe);
    // La classe si toglie a tempo, non con l'evento 'animationend': quello non
    // arriva se l'elemento viene nascosto a metà corsa o se il browser tiene
    // ferme le animazioni, e il pannello resterebbe inchiodato a opacità 0.
    clearTimeout(animTimer);
    animTimer = setTimeout(function () { pulisci(el); }, 400);
  }

  function showHub() {
    panels.forEach(function (p) { p.hidden = true; pulisci(p); });
    hub.hidden = false;
    anima(hub, 'adm-anim-back');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function openPanel(key) {
    var el = panelEl(key);
    if (!el) { showHub(); return; }
    hub.hidden = true;
    pulisci(hub);
    panels.forEach(function (p) { p.hidden = (p !== el); if (p !== el) pulisci(p); });
    anima(el, 'adm-anim-in');
    // porta in cima il pannello aperto
    window.scrollTo({ top: 0, behavior: 'auto' });
    var h = el.querySelector('.staff-title'); if (h) { try { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } catch (e) {} }
  }

  function syncFromHash() {
    var key = (location.hash || '').replace(/^#/, '');
    if (key && panelEl(key)) openPanel(key);
    else showHub();
  }

  tiles.forEach(function (t) {
    t.addEventListener('click', function () {
      var key = t.getAttribute('data-panel');
      if (location.hash === '#' + key) syncFromHash();   // già lì: forza apertura
      else location.hash = key;                           // → hashchange → apertura
    });
  });
  document.querySelectorAll('.adm-back[data-back]').forEach(function (b) {
    b.addEventListener('click', function () {
      // preferisci il "back" del browser se veniamo dall'hub, altrimenti pulisci l'hash
      if (location.hash) { history.pushState('', document.title, location.pathname + location.search); }
      showHub();
    });
  });

  window.addEventListener('hashchange', syncFromHash);
  // All'avvio: se c'è un flash (azione appena eseguita) e conosciamo l'ultimo
  // pannello, riaprilo; altrimenti rispetta l'hash; altrimenti mostra l'hub.
  syncFromHash();
  primoGiro = false;   // da qui in poi i passaggi sono animati
})();

(function () {
  'use strict';
  var cards = document.querySelectorAll('.reward-qr[data-code]');
  if (!cards.length) return;

  // Converte l'SVG del QR di una card in un Blob PNG (fondo bianco, ad alta risoluzione)
  function svgToPng(card, cb) {
    var svg = card.querySelector('.reward-qr-img svg');
    if (!svg) { cb(null); return; }
    var size = 512;
    var data = new XMLSerializer().serializeToString(svg);
    var url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = size; c.height = size;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      try { c.toBlob(function (b) { cb(b); }, 'image/png'); } catch (e) { cb(null); }
    };
    img.onerror = function () { cb(null); };
    img.src = url;
  }

  function feedback(btn, text) {
    if (!btn) return;
    var prev = btn.getAttribute('data-label') || btn.innerHTML;
    if (!btn.getAttribute('data-label')) btn.setAttribute('data-label', prev);
    btn.textContent = text;
    setTimeout(function () { btn.innerHTML = btn.getAttribute('data-label'); }, 1500);
  }

  Array.prototype.forEach.call(cards, function (card) {
    var code = card.getAttribute('data-code') || 'qr';
    var dl = card.querySelector('.qr-dl');
    var cp = card.querySelector('.qr-copy');

    if (dl) dl.addEventListener('click', function () {
      svgToPng(card, function (blob) {
        if (!blob) { feedback(dl, 'Errore'); return; }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'qr-' + code + '.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        feedback(dl, 'Scaricato');
      });
    });

    if (cp) cp.addEventListener('click', function () {
      if (!navigator.clipboard || !window.ClipboardItem) { feedback(cp, 'Non supportato'); return; }
      svgToPng(card, function (blob) {
        if (!blob) { feedback(cp, 'Errore'); return; }
        try {
          navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
            .then(function () { feedback(cp, 'Copiato!'); })
            .catch(function () { feedback(cp, 'Errore'); });
        } catch (e) { feedback(cp, 'Non supportato'); }
      });
    });
  });
})();

// ── Utenti: ricerca e ordinamento ──────────────────────────────────
// Le righe sono già tutte in pagina, quindi si filtra e si riordina qui:
// passare dal server a ogni ricerca vorrebbe dire ricaricare il pannello e
// perdere il punto in cui si era arrivati scorrendo.
//
// L'ordine di iscrizione non si ricalcola: è quello con cui il server manda
// le righe, e sta in data-i. Così tornarci è rimettere le righe come stavano,
// non indovinare di nuovo una data.
(function () {
  'use strict';
  var barra = document.querySelector('[data-utenti-barra]');
  var lista = document.querySelector('[data-utenti-lista]');
  if (!barra || !lista) return;

  var campo = barra.querySelector('[data-utenti-cerca]');
  var bottoni = Array.prototype.slice.call(barra.querySelectorAll('[data-utenti-ordina]'));
  var esito = document.querySelector('[data-utenti-esito]');
  var righe = Array.prototype.slice.call(lista.querySelectorAll('.user-row'));

  function ordina(modo) {
    var ordinate = righe.slice().sort(function (a, b) {
      if (modo === 'alfabetico') {
        // localeCompare e non < : senza, "Àlex" finirebbe dopo "Zeno" e i
        // nomi con accenti o maiuscole si ordinerebbero per codice.
        return a.dataset.nome.localeCompare(b.dataset.nome, 'it');
      }
      return Number(a.dataset.i) - Number(b.dataset.i);
    });
    // Un frammento solo: appendere una riga alla volta al DOM vivo farebbe
    // ricalcolare il layout a ogni giro, e qui le righe sono centinaia.
    var frammento = document.createDocumentFragment();
    ordinate.forEach(function (r) { frammento.appendChild(r); });
    lista.appendChild(frammento);
  }

  function filtra() {
    var q = (campo.value || '').trim().toLowerCase();
    var visibili = 0;
    righe.forEach(function (r) {
      var ok = !q || r.dataset.nome.indexOf(q) !== -1 || r.dataset.email.indexOf(q) !== -1;
      r.hidden = !ok;
      if (ok) visibili++;
    });
    if (!q) { esito.hidden = true; return; }
    esito.hidden = false;
    esito.textContent = visibili
      ? visibili + (visibili === 1 ? ' utente trovato' : ' utenti trovati')
      : 'Nessun utente per «' + campo.value.trim() + '».';
  }

  bottoni.forEach(function (b) {
    b.addEventListener('click', function () {
      bottoni.forEach(function (x) {
        var attivo = x === b;
        x.classList.toggle('is-attivo', attivo);
        x.setAttribute('aria-pressed', attivo ? 'true' : 'false');
      });
      ordina(b.dataset.utentiOrdina);
    });
  });

  campo.addEventListener('input', filtra);
  // La "x" del campo di ricerca su iOS non fa scattare 'input' in tutte le
  // versioni: senza questo la lista resterebbe filtrata a campo vuoto.
  campo.addEventListener('search', filtra);
})();
