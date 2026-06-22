/* ===================================================================
   FantaSanRocco — Ruota della Fortuna (gratis 1×/giorno)
   Il premio è deciso dal server. Qui la ruota si limita a fermarsi
   sullo spicchio ricevuto. Stessa valuta della classifica.
   =================================================================== */
(function () {
  const root = document.getElementById('czWheelRoot');
  if (!root) return;
  const csrf = root.dataset.csrf || '';
  const step = parseFloat(root.dataset.step) || 45;

  const wheel = document.getElementById('czWheel');
  const btn = document.getElementById('czSpinWheel');
  const elBalance = document.getElementById('czBalance');
  const elResult = document.getElementById('czResult');
  const elAmt = document.getElementById('czResultAmt');
  const elLbl = document.getElementById('czResultLbl');
  const elFlash = document.getElementById('czFlash');

  let spinning = false;
  let turns = 0;   // giri accumulati, così riparte sempre in avanti

  function arcadeFlash(text) {
    if (!elFlash) return;
    elFlash.textContent = text;
    elFlash.classList.remove('show'); void elFlash.offsetWidth; elFlash.classList.add('show');
  }
  if (elFlash) elFlash.addEventListener('animationend', () => elFlash.classList.remove('show'));

  function spin() {
    if (spinning || btn.disabled) return;
    spinning = true; btn.disabled = true;
    elResult.classList.remove('show', 'jackpot');

    fetch('/ruota/gira', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrf }),
    }).then((rs) => rs.json().then((data) => ({ ok: rs.ok, data }))).then(({ ok, data }) => {
      if (!ok || !data.ok) {
        btn.textContent = (data && data.message) ? data.message : 'Riprova più tardi';
        spinning = false;
        return;
      }
      // Porta il centro dello spicchio vincente sotto la freccia (in alto)
      const mid = data.index * step + step / 2;
      const jitter = (Math.random() * (step * 0.5)) - (step * 0.25);
      turns += 6;
      const rotation = turns * 360 - mid + jitter;
      wheel.style.transform = 'rotate(' + rotation + 'deg)';

      setTimeout(() => {
        elBalance.textContent = data.balance;
        elBalance.classList.add('bump');
        const nb = document.querySelector('.nav-balance-val');
        if (nb) { nb.textContent = data.balance; nb.classList.remove('bump'); void nb.offsetWidth; nb.classList.add('bump'); }
        elAmt.textContent = '+' + data.points;
        elLbl.textContent = data.jackpot ? 'JACKPOT! Che fortuna 🎆' : 'punti vinti — entrano in classifica';
        elResult.classList.add('show');
        if (data.jackpot) { elResult.classList.add('jackpot'); arcadeFlash('JACKPOT!'); }
        btn.textContent = 'Torna domani per un altro giro';
        spinning = false;
      }, 5200);
    }).catch(() => { btn.disabled = false; spinning = false; btn.textContent = 'Connessione assente — riprova'; });
  }

  btn.addEventListener('click', spin);
})();
