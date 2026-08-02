/* ===================================================================
   Campo OTP a caselle — codice della verifica in due passaggi.

   È un miglioramento progressivo, non un rimpiazzo: nella pagina resta
   il solito <input name="code">, e se il JavaScript non parte l'utente
   digita il codice là dentro come ha sempre fatto. Quando parte, quel
   campo viene nascosto e davanti compaiono le caselle, che scrivono
   dentro di lui. Il form che va al server non cambia di una virgola.
   =================================================================== */
(function () {
  'use strict';

  var SOLO_CIFRE = /^[0-9]$/;

  function pulisci(testo) {
    return String(testo || '').split('').filter(function (c) { return SOLO_CIFRE.test(c); }).join('');
  }

  function costruisci(vero) {
    var lunghezza = parseInt(vero.getAttribute('data-otp-length'), 10) || 6;
    var raggruppa = parseInt(vero.getAttribute('data-otp-group'), 10);
    if (isNaN(raggruppa)) raggruppa = 3;
    var autoInvia = vero.hasAttribute('data-otp-autosubmit');
    var etichetta = vero.getAttribute('data-otp-label') || 'Codice di verifica';

    // Il campo vero sparisce dalla vista e dal giro dei TAB, ma resta nel
    // form. Gli togliamo "required": un campo obbligatorio e invisibile
    // manda il browser in errore («invalid form control is not focusable»)
    // perché vorrebbe metterci sopra il cursore e non ci riesce. Al suo
    // posto controlliamo noi che il codice sia completo, prima dell'invio.
    vero.removeAttribute('required');
    vero.removeAttribute('autofocus');
    vero.classList.add('otp-vero');
    vero.setAttribute('tabindex', '-1');
    vero.setAttribute('aria-hidden', 'true');

    var gruppo = document.createElement('div');
    gruppo.className = 'otp';
    gruppo.setAttribute('role', 'group');
    gruppo.setAttribute('aria-label', etichetta);

    var caselle = [];
    var valori = [];
    for (var i = 0; i < lunghezza; i++) valori.push('');

    // Semina: se il campo arriva dal server già compilato, lo rispettiamo.
    pulisci(vero.value).slice(0, lunghezza).split('').forEach(function (c, i) { valori[i] = c; });

    function scrivi() {
      vero.value = valori.join('');
    }

    function completo() {
      return valori.every(function (c) { return c !== ''; });
    }

    function metti(indice, carattere) {
      valori[indice] = carattere;
      var cella = caselle[indice];
      cella.input.value = carattere;
      var vecchio = cella.segno.firstChild;
      if (carattere) {
        if (!vecchio || vecchio.textContent !== carattere) {
          if (vecchio) vecchio.remove();
          var span = document.createElement('span');
          span.className = 'otp-carattere';
          span.textContent = carattere;
          cella.segno.appendChild(span);
        }
      } else if (vecchio) {
        // Uscita in dissolvenza: lo stacchiamo subito dal conteggio e lo
        // lasciamo morire da solo, così una digitazione veloce non aspetta.
        vecchio.classList.add('otp-carattere--esce');
        var morto = vecchio;
        setTimeout(function () { morto.remove(); }, 160);
      }
      cella.casella.classList.toggle('otp-casella--piena', !!carattere);
      scrivi();
    }

    function fuoco(indice) {
      var i = Math.max(0, Math.min(lunghezza - 1, indice));
      var input = caselle[i] && caselle[i].input;
      if (!input) return;
      input.focus();
      try { input.select(); } catch (e) {}
    }

    function riempiDa(indice, testo) {
      var entrata = pulisci(testo);
      if (!entrata.length) return;
      var cursore = indice;
      for (var k = 0; k < entrata.length && cursore < lunghezza; k++, cursore++) {
        metti(cursore, entrata[k]);
      }
      fuoco(cursore);
      forse();
    }

    var giaInviato = '';
    function forse() {
      if (!autoInvia || !completo()) return;
      var v = valori.join('');
      if (v === giaInviato) return;      // niente doppioni: un codice, un tentativo
      giaInviato = v;
      var form = vero.form;
      if (!form) return;
      gruppo.classList.add('otp--attesa');
      // Un attimo di respiro perché l'ultima cifra si veda comparire.
      setTimeout(function () {
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.submit();
      }, 180);
    }

    for (var n = 0; n < lunghezza; n++) {
      (function (indice) {
        var casella = document.createElement('div');
        casella.className = 'otp-casella';
        if (raggruppa > 0 && indice > 0 && indice % raggruppa === 0) {
          casella.classList.add('otp-casella--stacco');
        }

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'otp-input';
        input.inputMode = 'numeric';
        input.autocomplete = indice === 0 ? 'one-time-code' : 'off';
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('autocapitalize', 'off');
        input.spellcheck = false;
        // Niente maxlength="1": il riempimento automatico del codice via SMS
        // scarica tutte e sei le cifre nella prima casella, e il browser
        // taglierebbe le altre cinque prima che possiamo distribuirle noi.
        input.disabled = vero.disabled;
        input.setAttribute('aria-label', etichetta + ', cifra ' + (indice + 1) + ' di ' + lunghezza);

        var segno = document.createElement('span');
        segno.className = 'otp-segno';
        segno.setAttribute('aria-hidden', 'true');

        var cursore = document.createElement('span');
        cursore.className = 'otp-cursore';
        cursore.setAttribute('aria-hidden', 'true');

        casella.appendChild(input);
        casella.appendChild(segno);
        casella.appendChild(cursore);
        gruppo.appendChild(casella);
        caselle.push({ casella: casella, input: input, segno: segno });

        input.addEventListener('input', function (e) {
          var grezzo = e.target.value;
          // Senza maxlength, digitare sopra una casella già piena lascia
          // dentro tutte e due le cifre ("4" + "5" = "45"). Se la nuova
          // stringa comincia con quella vecchia, la parte nuova è la coda.
          var precedente = valori[indice] || '';
          var utile = (grezzo.length > 1 && precedente && grezzo.indexOf(precedente) === 0)
            ? grezzo.slice(precedente.length)
            : grezzo;
          var entrata = pulisci(utile);

          if (!entrata.length) {
            // Cancellazione dal campo (succede su alcune tastiere Android).
            if (!grezzo.length && valori[indice]) metti(indice, '');
            e.target.value = valori[indice] || '';
            return;
          }
          if (entrata.length === 1) {
            metti(indice, entrata);
            if (indice < lunghezza - 1) fuoco(indice + 1);
            forse();
            return;
          }
          // Alcuni gestori di password incollano tutto dentro una casella.
          riempiDa(indice, entrata);
        });

        input.addEventListener('keydown', function (e) {
          if (e.key === 'Backspace') {
            e.preventDefault();
            if (valori[indice]) { metti(indice, ''); return; }
            if (indice > 0) { metti(indice - 1, ''); fuoco(indice - 1); }
            return;
          }
          if (e.key === 'Delete')     { e.preventDefault(); metti(indice, ''); return; }
          if (e.key === 'ArrowLeft')  { e.preventDefault(); fuoco(indice - 1); return; }
          if (e.key === 'ArrowRight') { e.preventDefault(); fuoco(indice + 1); return; }
          if (e.key === 'Home')       { e.preventDefault(); fuoco(0); return; }
          if (e.key === 'End')        { e.preventDefault(); fuoco(lunghezza - 1); }
        });

        input.addEventListener('paste', function (e) {
          e.preventDefault();
          var testo = pulisci((e.clipboardData || window.clipboardData).getData('text'));
          // Un codice intero incollato parte sempre dall'inizio, ovunque sia
          // finito il cursore: è quello che si aspetta chi copia dall'SMS.
          riempiDa(testo.length >= lunghezza ? 0 : indice, testo);
        });

        input.addEventListener('focus', function (e) {
          try { e.target.select(); } catch (err) {}
          var primoVuoto = valori.indexOf('');
          if (primoVuoto !== -1 && primoVuoto < indice) { fuoco(primoVuoto); return; }
          gruppo.classList.add('otp--attivo');
          casella.classList.add('otp-casella--attiva');
        });

        input.addEventListener('blur', function (e) {
          casella.classList.remove('otp-casella--attiva');
          var verso = e.relatedTarget;
          var dentro = caselle.some(function (c) { return c.input === verso; });
          if (!dentro) gruppo.classList.remove('otp--attivo');
        });
      })(n);
    }

    // Se il campo sta dentro una <label>, le caselle vanno FUORI da quella:
    // un clic dentro una label rimbalza sul primo campo che contiene, che
    // qui è quello nascosto — e il cursore sparirebbe a ogni tocco.
    var etichetta = vero.closest('label');
    if (etichetta) etichetta.parentNode.insertBefore(gruppo, etichetta.nextSibling);
    else vero.parentNode.insertBefore(gruppo, vero);

    // Ridisegna le caselle già seminate.
    valori.slice().forEach(function (c, i) { if (c) metti(i, c); });

    // Se la pagina è tornata indietro con un errore, le caselle lo dicono:
    // bordo rosso e una scrollata di spalle, poi si ripulisce da sola.
    var errore = document.querySelector('.flash-error');
    if (errore) {
      gruppo.classList.add('otp--errore');
      valori.slice().forEach(function (c, i) { if (c) metti(i, ''); });
      setTimeout(function () { gruppo.classList.remove('otp--errore'); }, 900);
    }

    // Rete di sicurezza: se il codice non è completo non lasciamo partire
    // il form a vuoto (il server lo rifiuterebbe e si perderebbe un giro).
    if (vero.form) {
      vero.form.addEventListener('submit', function (e) {
        if (vero.disabled) return;
        if (completo()) return;
        e.preventDefault();
        gruppo.classList.add('otp--errore');
        setTimeout(function () { gruppo.classList.remove('otp--errore'); }, 700);
        fuoco(valori.indexOf(''));
      });
    }

    if (vero.hasAttribute('data-otp-autofocus') && !vero.disabled) {
      // Su telefono non forziamo la tastiera in faccia appena si apre.
      if (!window.matchMedia('(max-width: 640px)').matches) fuoco(valori.indexOf('') === -1 ? 0 : valori.indexOf(''));
    }

    return { gruppo: gruppo, fuoco: fuoco };
  }

  function avvia() {
    Array.prototype.forEach.call(document.querySelectorAll('input[data-otp]'), function (vero) {
      if (vero.dataset.otpPronto) return;
      vero.dataset.otpPronto = '1';
      try { costruisci(vero); } catch (e) { /* meglio il campo semplice che niente */ }
    });

    // Scambio fra codice dell'app e codice di recupero. I due campi si
    // chiamano tutti e due "code": quello spento va disabilitato, altrimenti
    // il browser ne manderebbe due e vincerebbe il vuoto.
    var scambio = document.querySelector('[data-otp-scambio]');
    if (!scambio) return;
    var bloccoOtp = document.getElementById('bloccoOtp');
    var bloccoRec = document.getElementById('bloccoRecupero');
    if (!bloccoOtp || !bloccoRec) return;

    scambio.addEventListener('click', function () {
      var suRecupero = bloccoRec.hidden;
      bloccoRec.hidden = !suRecupero;
      bloccoOtp.hidden = suRecupero;
      bloccoOtp.querySelectorAll('input').forEach(function (i) { i.disabled = suRecupero; });
      bloccoRec.querySelectorAll('input').forEach(function (i) { i.disabled = !suRecupero; });
      scambio.textContent = suRecupero ? '← Usa il codice dell\'app' : 'Non hai il telefono? Usa un codice di recupero';
      if (suRecupero) bloccoRec.querySelector('input').focus();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia);
  else avvia();
})();
