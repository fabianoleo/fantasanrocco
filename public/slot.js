/* ===================================================================
   FantaSanRocco — Slot «Tombola di San Rocco»
   L'ESITO è deciso dal server (RNG + vantaggio del banco). Qui solo
   l'animazione dei rulli che si fermano sui simboli ricevuti.
   =================================================================== */
(function () {
  const root = document.getElementById('czSlot');
  if (!root) return;
  const csrf = root.dataset.csrf || '';
  let balance = parseInt(root.dataset.balance, 10) || 0;
  let bet = parseInt(root.dataset.bet, 10) || 10;

  const TILE = 96;
  const elBalance = document.getElementById('czBalance');
  const elOutcome = document.getElementById('czOutcome');
  const elSpin = document.getElementById('czSpin');
  const elFlash = document.getElementById('czFlash');
  const reels = [0, 1, 2].map((i) => document.getElementById('czReel' + i));
  const betBtns = [...root.querySelectorAll('.cz-bet')];

  // Mappa simbolo → markup SVG (dai <template id="sym-KEY">)
  const SYM = {};
  document.querySelectorAll('template[id^="sym-"]').forEach((t) => { SYM[t.id.slice(4)] = t.innerHTML; });
  const KEYS = Object.keys(SYM);
  const NAME = { sanrocco: 'San Rocco', fuoco: 'fuochi', braciola: 'braciole', vino: 'brocche di vino', percoca: 'percoche', ciliegia: 'ciliegie' };

  let spinning = false;

  function tile(k) { return '<div class="cz-tile">' + (SYM[k] || '') + '</div>'; }
  function randKey() { return KEYS[(Math.random() * KEYS.length) | 0]; }

  function setBalance(v) {
    balance = v;
    elBalance.textContent = v;
    elBalance.classList.remove('bump'); void elBalance.offsetWidth; elBalance.classList.add('bump');
    updateNavBalance(v);
    refreshBets();
  }
  // Aggiorna anche il saldo mostrato nella barra in alto
  function updateNavBalance(v) {
    const nb = document.querySelector('.nav-balance-val');
    if (!nb) return;
    nb.textContent = v;
    nb.classList.remove('bump'); void nb.offsetWidth; nb.classList.add('bump');
  }
  function refreshBets() {
    betBtns.forEach((b) => {
      const v = parseInt(b.dataset.bet, 10);
      b.disabled = v > balance;
      b.style.opacity = v > balance ? '.4' : '';
    });
  }

  betBtns.forEach((b) => b.addEventListener('click', () => {
    if (spinning || b.disabled) return;
    bet = parseInt(b.dataset.bet, 10);
    betBtns.forEach((x) => x.classList.toggle('sel', x === b));
  }));
  refreshBets();

  function arcadeFlash(text) {
    if (!elFlash) return;
    elFlash.textContent = text;
    elFlash.classList.remove('show'); void elFlash.offsetWidth; elFlash.classList.add('show');
  }
  if (elFlash) elFlash.addEventListener('animationend', () => elFlash.classList.remove('show'));

  function spinReel(reelEl, finalKey, dur) {
    const strip = reelEl.querySelector('.cz-reel-strip');
    const count = 22 + ((Math.random() * 6) | 0);
    let html = '';
    for (let i = 0; i < count; i++) html += tile(randKey());
    html += tile(finalKey);
    reelEl.classList.remove('win');
    strip.style.transition = 'none';
    strip.style.transform = 'translateY(0)';
    strip.innerHTML = html;
    void strip.offsetHeight;                       // reflow
    strip.style.transition = 'transform ' + dur + 'ms cubic-bezier(.16,.72,.24,1)';
    strip.style.transform = 'translateY(' + (-(count * TILE)) + 'px)';
    return dur;
  }

  function showOutcome(d) {
    if (d.win) {
      const what = d.kind === 'tris' ? 'tris di ' + (NAME[d.sym] || '') : 'coppia di ' + (NAME[d.sym] || '');
      elOutcome.innerHTML = '<span class="win">Hai vinto <b>+' + d.payout + '</b> punti! · ' + what + '</span>';
      elOutcome.classList.toggle('jack', !!d.jackpot);
      if (d.jackpot) reels.forEach((r) => r.classList.add('win'));
      else if (d.kind === 'tris') reels.forEach((r) => r.classList.add('win'));
    } else {
      elOutcome.innerHTML = '<span class="lose">Niente questa volta… ritenta!</span>';
      elOutcome.classList.remove('jack');
    }
  }

  function spin() {
    if (spinning) return;
    if (balance < bet) { elOutcome.innerHTML = '<span class="lose">Punti insufficienti per questa puntata.</span>'; return; }
    spinning = true; elSpin.disabled = true; elOutcome.textContent = '';
    reels.forEach((r) => r.classList.remove('win'));

    fetch('/slot/gira', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ bet: String(bet), _csrf: csrf }),
    }).then((rs) => rs.json().then((data) => ({ ok: rs.ok, data }))).then(({ ok, data }) => {
      if (!ok || !data.ok) {
        elOutcome.innerHTML = '<span class="lose">' + (data && data.message ? data.message : 'Errore, riprova.') + '</span>';
        spinning = false; elSpin.disabled = false; refreshBets();
        return;
      }
      const durs = [1500, 1950, 2450];
      data.reels.forEach((k, i) => spinReel(reels[i], k, durs[i]));
      setTimeout(() => {
        setBalance(data.balance);
        showOutcome(data);
        if (data.jackpot) arcadeFlash('JACKPOT!');
        else if (data.win && data.kind === 'tris') arcadeFlash('TRIS!');
        spinning = false; elSpin.disabled = false;
      }, durs[2] + 180);
    }).catch(() => {
      elOutcome.innerHTML = '<span class="lose">Connessione assente. Riprova.</span>';
      spinning = false; elSpin.disabled = false; refreshBets();
    });
  }

  elSpin.addEventListener('click', spin);
})();
