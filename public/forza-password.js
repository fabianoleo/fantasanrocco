/* ===================================================================
   Misuratore di forza della password.

   I criteri qui sotto sono gli stessi che applica il server, più tre
   consigli. L'unico obbligo vero è la lunghezza: le altre tre voci
   alzano il punteggio ma non impediscono di registrarsi, esattamente
   come si comporta /registrati, /reset-password e /profilo. Se qui
   dicessimo di più di quello che il server pretende, staremmo mentendo.
   =================================================================== */
(function () {
  'use strict';

  var MINIMO = 8;   // deve restare uguale a password.length < 8 in server.js

  // Roba che qualunque tentativo di indovinare prova nei primi mille colpi.
  // Oltre alle solite, quelle di casa: il paese, la festa, il nome del gioco.
  var SCONTATE = /^(?:password|passw0rd|qwerty|letmein|welcome|admin|iloveyou|monkey|dragon|abc123|111111|123123|123456|ciaociao|amoremio|juventus|napoli|sanrocco|siano|fantasanrocco|calcio|giuseppe|francesco)/i;
  var RIPETUTE = /(.)\1{3,}/;                                    // aaaa, 1111
  var SEQUENZE = /(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|wert|erty|asdf)/i;
  var SIMBOLO  = /[!-/:-@[-`{-~]/;

  var CRITERI = [
    { id: 'lunghezza', etichetta: 'Almeno ' + MINIMO + ' caratteri', obbligatorio: true,
      prova: function (v) { return v.length >= MINIMO; } },
    { id: 'maiuscole', etichetta: 'Maiuscole e minuscole',
      prova: function (v) { return /[a-zà-ÿ]/.test(v) && /[A-ZÀ-Ý]/.test(v); } },
    { id: 'numero',    etichetta: 'Almeno un numero',
      prova: function (v) { return /\d/.test(v); } },
    { id: 'simbolo',   etichetta: 'Un simbolo (! ? # @ …)',
      prova: function (v) { return SIMBOLO.test(v); } }
  ];

  var VOCI = ['', 'Debole', 'Discreta', 'Buona', 'Forte'];

  function valuta(valore) {
    var esiti = CRITERI.map(function (c) { return { criterio: c, ok: c.prova(valore) }; });
    var passati = esiti.filter(function (e) { return e.ok; }).length;
    var scontata = valore.length > 0 &&
      (SCONTATE.test(valore) || RIPETUTE.test(valore) || SEQUENZE.test(valore));

    // Una password prevedibile resta debole anche se spunta tutte le caselle:
    // «Password1!» ha maiuscola, numero e simbolo e non protegge niente.
    var punteggio = valore.length === 0 ? 0
                  : scontata ? 1
                  : Math.max(1, passati);

    return {
      punteggio: punteggio,
      massimo: CRITERI.length,
      voce: VOCI[Math.min(punteggio, VOCI.length - 1)],
      esiti: esiti,
      scontata: scontata,
      mancanti: esiti.filter(function (e) { return !e.ok; })
    };
  }

  function tono(punteggio, massimo) {
    if (punteggio === 0) return 'vuoto';
    var q = punteggio / massimo;
    if (q <= 0.34) return 'rosso';
    if (q <= 0.67) return 'ambra';
    return 'verde';
  }

  function attacca(campo) {
    var pannello = document.createElement('div');
    pannello.className = 'fp';

    var barre = document.createElement('div');
    barre.className = 'fp-barre';
    barre.setAttribute('role', 'meter');
    barre.setAttribute('aria-label', 'Forza della password');
    barre.setAttribute('aria-valuemin', '0');
    barre.setAttribute('aria-valuemax', String(CRITERI.length));
    barre.setAttribute('aria-valuenow', '0');
    barre.style.gridTemplateColumns = 'repeat(' + CRITERI.length + ', minmax(0, 1fr))';

    var tacche = CRITERI.map(function () {
      var g = document.createElement('span');
      g.className = 'fp-barra';
      var p = document.createElement('i');
      g.appendChild(p);
      barre.appendChild(g);
      return g;
    });

    var riga = document.createElement('div');
    riga.className = 'fp-riga';
    var voce = document.createElement('span');
    voce.className = 'fp-voce';
    voce.setAttribute('aria-hidden', 'true');
    var avviso = document.createElement('span');
    avviso.className = 'fp-scontata';
    avviso.setAttribute('aria-hidden', 'true');
    avviso.textContent = 'Troppo facile da indovinare';
    riga.appendChild(voce);
    riga.appendChild(avviso);

    var elenco = document.createElement('ul');
    elenco.className = 'fp-criteri';
    var voci = CRITERI.map(function (c) {
      var li = document.createElement('li');
      li.className = 'fp-criterio';
      li.innerHTML =
        '<span class="fp-spunta" aria-hidden="true">' +
        '<svg viewBox="0 0 12 12" fill="none"><path d="M2 6.2 4.7 8.9 10 3.3" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</span><span class="fp-testo"></span><span class="fp-stato sr-only"></span>';
      li.querySelector('.fp-testo').textContent =
        c.etichetta + (c.obbligatorio ? ' (obbligatorio)' : '');
      elenco.appendChild(li);
      return li;
    });

    // Un solo annuncio, e solo quando l'utente ha smesso di digitare:
    // altrimenti il lettore di schermo leggerebbe una frase per ogni tasto.
    var annuncio = document.createElement('p');
    annuncio.className = 'sr-only';
    annuncio.setAttribute('aria-live', 'polite');

    pannello.appendChild(barre);
    pannello.appendChild(riga);
    pannello.appendChild(elenco);
    pannello.appendChild(annuncio);

    // Il campo sta dentro una <label>: il pannello va dopo la label intera,
    // se no finisce dentro l'area cliccabile e ogni clic riporta il cursore.
    var etichetta = campo.closest('label');
    var dopo = etichetta || campo;
    dopo.parentNode.insertBefore(pannello, dopo.nextSibling);

    var attesa = null;

    function aggiorna() {
      var stato = valuta(campo.value || '');
      var t = tono(stato.punteggio, stato.massimo);

      pannello.dataset.tono = t;
      pannello.classList.toggle('fp--vuoto', stato.punteggio === 0);
      barre.setAttribute('aria-valuenow', String(stato.punteggio));
      barre.setAttribute('aria-valuetext', stato.voce || 'nessuna password');

      tacche.forEach(function (g, i) {
        g.classList.toggle('fp-barra--accesa', i < stato.punteggio);
        g.style.setProperty('--ritardo', (i < stato.punteggio ? i * 0.03 : 0) + 's');
      });

      voce.textContent = stato.voce;
      avviso.classList.toggle('fp-scontata--vista', stato.scontata);

      stato.esiti.forEach(function (e, i) {
        voci[i].classList.toggle('fp-criterio--ok', e.ok);
        voci[i].querySelector('.fp-stato').textContent = e.ok ? 'soddisfatto' : 'non soddisfatto';
      });

      clearTimeout(attesa);
      attesa = setTimeout(function () {
        if (!campo.value) { annuncio.textContent = ''; return; }
        annuncio.textContent = [
          'Password ' + stato.voce.toLowerCase() + '.',
          stato.scontata ? 'È una password fra le più provate.' : '',
          stato.mancanti.length === 0
            ? 'Tutti i criteri soddisfatti.'
            : 'Manca ancora: ' + stato.mancanti.map(function (e) {
                return e.criterio.etichetta.toLowerCase();
              }).join(', ') + '.'
        ].filter(Boolean).join(' ');
      }, 700);
    }

    campo.addEventListener('input', aggiorna);
    aggiorna();
  }

  function avvia() {
    Array.prototype.forEach.call(document.querySelectorAll('input[data-forza]'), function (campo) {
      if (campo.dataset.forzaPronta) return;
      campo.dataset.forzaPronta = '1';
      try { attacca(campo); } catch (e) { /* il campo funziona lo stesso */ }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia);
  else avvia();
})();
