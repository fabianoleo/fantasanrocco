// ===================================================================
// FantaSanRocco — finestrella "Segnala un problema"
// -------------------------------------------------------------------
// Apre il <dialog> del footer e manda il modulo senza ricaricare la
// pagina: chi segnala un guasto spesso lo fa mentre sta facendo altro,
// e una ricarica gli farebbe perdere quello che aveva in mano.
// ===================================================================
(function () {
  var apri = document.getElementById('segnalaApri');
  var dlg = document.getElementById('segnalaDialog');
  if (!apri || !dlg) return;

  var form = document.getElementById('segnalaForm');
  var esito = document.getElementById('sgEsito');
  var invia = document.getElementById('segnalaInvia');
  var chiudi = document.getElementById('segnalaChiudi');
  var testo = form.querySelector('[name=testo]');

  apri.addEventListener('click', function () {
    esito.textContent = '';
    esito.className = 'sg-esito';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    setTimeout(function () { testo.focus(); }, 50);
  });

  chiudi.addEventListener('click', function () {
    if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
  });

  // Cliccando sullo sfondo scuro si chiude: il <dialog> riceve il click
  // quando avviene fuori dal riquadro, perche' il riquadro e' il form.
  dlg.addEventListener('click', function (e) {
    if (e.target === dlg && dlg.close) dlg.close();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();                       // method="dialog" chiuderebbe e basta
    var t = (testo.value || '').trim();
    if (t.length < 10) {
      esito.textContent = 'Scrivi almeno una riga: senza dettagli non riusciamo a capire.';
      esito.className = 'sg-esito is-ko';
      return;
    }
    invia.disabled = true;
    esito.textContent = 'Invio…';
    esito.className = 'sg-esito';

    var meta = document.querySelector('meta[name="csrf-token"]');
    fetch('/segnalazioni', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': meta ? meta.getAttribute('content') : '',
      },
      body: JSON.stringify({
        tipo: (form.querySelector('[name=tipo]:checked') || {}).value || 'altro',
        testo: t,
        // Da quale pagina arriva: senza, meta' delle segnalazioni sono
        // impossibili da riprodurre.
        pagina: location.pathname + location.search,
      }),
    })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (d) {
        if (d.ok) {
          esito.textContent = d.message || 'Ricevuto, grazie.';
          esito.className = 'sg-esito is-ok';
          testo.value = '';
          setTimeout(function () { if (dlg.close) dlg.close(); }, 1600);
        } else {
          esito.textContent = d.message || 'Non è riuscito. Riprova fra poco.';
          esito.className = 'sg-esito is-ko';
        }
      })
      .catch(function () {
        esito.textContent = 'Niente rete. Riprova quando torna il segnale.';
        esito.className = 'sg-esito is-ko';
      })
      .then(function () { invia.disabled = false; });
  });
})();
