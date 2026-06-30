/* =====================================================================
   Streak giornaliero — popup "premio del giorno"
   Mostra il premio, lo rivendica (POST /api/streak/claim) e aggiorna il
   saldo punti nella barra. Idempotente lato server (una volta al giorno).
   ===================================================================== */
(function () {
  'use strict';
  var pop = document.getElementById('streakPop');
  if (!pop) return;
  var csrf = pop.dataset.csrf || '';
  var btn = document.getElementById('streakClaim');

  function open() { requestAnimationFrame(function () { pop.classList.add('is-open'); }); }
  function close() {
    pop.classList.remove('is-open');
    setTimeout(function () { if (pop && pop.parentNode) pop.parentNode.removeChild(pop); }, 320);
  }

  // Comparsa dopo un attimo (stile premio dei giochi mobile)
  setTimeout(open, 700);

  if (btn) btn.addEventListener('click', function () {
    btn.disabled = true;
    fetch('/api/streak/claim', {
      method: 'POST', headers: { 'X-CSRF-Token': csrf }, credentials: 'same-origin'
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && (d.claimed || d.alreadyToday)) {
        if (typeof d.balance === 'number') {
          var pill = document.querySelector('.nav-balance-val');
          if (pill) pill.textContent = d.balance;
        }
        btn.textContent = d.claimed ? ('Ritirato! +' + d.bonus) : 'Già ritirato oggi';
      }
      setTimeout(close, 750);
    }).catch(function () { close(); });
  });

  // Chiudi cliccando sullo sfondo
  pop.addEventListener('click', function (e) { if (e.target === pop) close(); });
})();
