/* ===================================================================
   FantaSanRocco — Sfida un amico
   Il pulsante sta nel pannello di fine partita dei due mini-giochi ed
   e' nascosto finche' non c'e' un punteggio da mettere in palio: a
   inizio partita non hai ancora niente da sfidare.

   Il punteggio NON viaggia da qui. Il server lo prende dall'ultima
   partita registrata, altrimenti basterebbe riscrivere la richiesta per
   sfidare qualcuno con un milione di punti.
   =================================================================== */
(function () {
  'use strict';

  const bottoni = Array.from(document.querySelectorAll('[data-sfida]'));
  if (!bottoni.length) return;

  const csrf = document.querySelector('meta[name="csrf-token"]');
  const token = csrf ? csrf.getAttribute('content') : '';

  // Il pannello di fine partita si riapre e si richiude da solo, e il
  // pulsante deve comparire solo DOPO una partita giocata. Non c'e' un
  // evento per saperlo, quindi si guarda il segno che il gioco lascia:
  // il testo del punteggio nel runner, la scritta del pulsante nel jetpack
  // che da «Gioca» diventa «Riprova».
  function haGiocato(gioco) {
    if (gioco === 'runner') {
      const sc = document.getElementById('gmOverScore');
      return !!(sc && sc.textContent.trim());
    }
    const play = document.getElementById('jpPlay');
    return !!(play && /riprova/i.test(play.textContent || ''));
  }

  function aggiorna() {
    bottoni.forEach((b) => { b.hidden = !haGiocato(b.dataset.sfida); });
  }
  // Un controllo periodico invece di un osservatore sui nodi: i pannelli
  // cambiano testo di continuo mentre si gioca, e osservarli vorrebbe dire
  // svegliarsi a ogni fotogramma per una cosa che deve solo comparire.
  setInterval(aggiorna, 700);
  aggiorna();

  // ── Finestrella ──────────────────────────────────────────────────
  const dlg = document.createElement('div');
  dlg.className = 'sfd-modal';
  dlg.hidden = true;
  dlg.innerHTML = `
    <div class="sfd-modal-fondo" data-chiudi></div>
    <div class="sfd-modal-card" role="dialog" aria-modal="true" aria-label="Sfida un amico">
      <button class="sfd-modal-x" type="button" data-chiudi aria-label="Chiudi">&times;</button>
      <p class="lp-kicker">Sfida a due</p>
      <h3 class="sfd-modal-tit">Chi vuoi sfidare?</h3>
      <p class="sfd-modal-sub">Scrivi il suo nickname, oppure la sua email se non è ancora iscritto.
        Gli arriva l'invito e ha <strong>una partita</strong> per batterti.</p>
      <input class="sfd-modal-inp" type="text" placeholder="nickname o email" autocomplete="off" spellcheck="false">
      <p class="sfd-modal-msg" hidden></p>
      <button class="btn sfd-modal-invia" type="button">Manda la sfida</button>
      <p class="sfd-modal-nota">Non dà punti né stelle: è una cosa fra voi due.</p>
    </div>`;
  document.body.appendChild(dlg);

  const inp   = dlg.querySelector('.sfd-modal-inp');
  const msg   = dlg.querySelector('.sfd-modal-msg');
  const invia = dlg.querySelector('.sfd-modal-invia');
  let giocoCorrente = null;

  function apri(gioco) {
    giocoCorrente = gioco;
    inp.value = '';
    msg.hidden = true;
    invia.disabled = false;
    invia.textContent = 'Manda la sfida';
    dlg.hidden = false;
    setTimeout(() => inp.focus(), 50);
  }
  function chiudi() { dlg.hidden = true; }

  function dici(testo, tipo) {
    msg.textContent = testo;
    msg.className = 'sfd-modal-msg' + (tipo ? ' is-' + tipo : '');
    msg.hidden = false;
  }

  bottoni.forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); apri(b.dataset.sfida); }));
  dlg.addEventListener('click', (e) => { if (e.target.hasAttribute('data-chiudi')) chiudi(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dlg.hidden) chiudi(); });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') manda(); });
  invia.addEventListener('click', manda);

  async function manda() {
    const destinatario = inp.value.trim();
    if (!destinatario) { dici('Scrivi un nickname o un’email.', 'no'); return; }
    invia.disabled = true;
    invia.textContent = 'Invio…';
    try {
      const r = await fetch('/sfida/crea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({ gioco: giocoCorrente, destinatario, _csrf: token }),
      });
      const d = await r.json();
      if (!d.ok) { dici(d.errore || 'Non è andata. Riprova.', 'no'); invia.disabled = false; invia.textContent = 'Manda la sfida'; return; }
      dici('Sfida mandata a ' + d.nome + '!', 'si');
      invia.textContent = 'Mandata ✓';
      setTimeout(chiudi, 1600);
    } catch (err) {
      dici('Connessione persa. Riprova.', 'no');
      invia.disabled = false;
      invia.textContent = 'Manda la sfida';
    }
  }
})();
