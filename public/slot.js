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
  const BET_MIN = parseInt(root.dataset.betMin, 10) || 5;
  const BET_MAX = parseInt(root.dataset.betMax, 10) || 500;
  const BET_STEP = 5;

  const TILE = 96;
  const elBalance = document.getElementById('czBalance');
  const elOutcome = document.getElementById('czOutcome');
  const elSpin = document.getElementById('czSpin');
  const elFlash = document.getElementById('czFlash');
  const reels = [0, 1, 2].map((i) => document.getElementById('czReel' + i));
  const betBtns = [...root.querySelectorAll('.cz-bet')];
  const elBetInput = document.getElementById('czBetInput');
  const elBetErr = document.getElementById('czBetErr');
  const elBetMinus = document.getElementById('czBetMinus');
  const elBetPlus = document.getElementById('czBetPlus');
  const elBetMax = document.getElementById('czBetMax');
  const sound = window.SlotSound || null;   // suoni sintetizzati (nessun file esterno)

  // ── Pulsante mute ──────────────────────────────────────────────
  const elMute = document.getElementById('czMute');
  function syncMuteUI() {
    if (!elMute || !sound) return;
    const isMuted = sound.isMuted();
    elMute.classList.toggle('is-muted', isMuted);
    elMute.setAttribute('aria-pressed', String(isMuted));
    elMute.setAttribute('aria-label', isMuted ? 'Attiva i suoni della slot' : 'Disattiva i suoni della slot');
    elMute.innerHTML = icon(isMuted ? 'volume-off' : 'volume-on');
  }
  function icon(name) {
    // Duplica solo le due varianti necessarie (evita di dipendere dal template EJS lato client)
    const P = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
    const inner = name === 'volume-off'
      ? '<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none" /><path d="M16 9.5 21 14.5" /><path d="M21 9.5 16 14.5" />'
      : '<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19 6a8.5 8.5 0 0 1 0 12" />';
    return '<svg class="ico" viewBox="0 0 24 24" ' + P + ' aria-hidden="true" focusable="false">' + inner + '</svg>';
  }
  if (elMute) {
    syncMuteUI();
    elMute.addEventListener('click', () => {
      if (sound) { sound.unlock(); sound.toggleMute(); }
      syncMuteUI();
    });
  }

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
    setBet(bet);   // riadatta la puntata al nuovo saldo
  }
  // Aggiorna anche il saldo mostrato nella barra in alto
  function updateNavBalance(v) {
    const nb = document.querySelector('.nav-balance-val');
    if (!nb) return;
    nb.textContent = v;
    nb.classList.remove('bump'); void nb.offsetWidth; nb.classList.add('bump');
  }
  // ── Puntata ────────────────────────────────────────────────────
  // Tetto reale della giocata: il massimo consentito, ma mai più di quanto
  // si ha in tasca. Se il saldo è sotto al minimo non si può proprio giocare.
  function maxBet() { return Math.min(BET_MAX, balance); }

  // Riporta un valore dentro i limiti. Il server ricontrolla comunque tutto:
  // questo serve solo a non far partire giocate che sarebbero rifiutate.
  function clampBet(v) {
    if (!Number.isFinite(v)) return BET_MIN;
    return Math.max(BET_MIN, Math.min(maxBet(), Math.round(v)));
  }

  // Aggiorna input, scorciatoie, messaggio e pulsante Gira in un colpo solo.
  function setBet(v, opts) {
    const silent = opts && opts.silent;
    bet = clampBet(v);
    if (elBetInput && !silent) elBetInput.value = String(bet);
    betBtns.forEach((x) => x.classList.toggle('sel', parseInt(x.dataset.bet, 10) === bet));
    refreshBets();
  }

  function refreshBets() {
    const max = maxBet();
    betBtns.forEach((b) => {
      const v = parseInt(b.dataset.bet, 10);
      const off = v > max;
      b.disabled = off;
      b.style.opacity = off ? '.4' : '';
    });
    const locked = spinning || balance < BET_MIN;
    if (elBetInput) { elBetInput.max = String(max); elBetInput.disabled = locked; }
    [elBetMinus, elBetPlus, elBetMax].forEach((el) => { if (el) el.disabled = locked; });

    let msg = '';
    if (balance < BET_MIN) msg = 'Punti finiti: servono almeno ' + BET_MIN + ' punti per giocare.';
    else if (bet > balance) msg = 'Non hai abbastanza punti: massimo ' + max + '.';
    else if (balance < BET_MAX) msg = 'Puntata da ' + BET_MIN + ' a ' + max + ' (il tuo saldo).';
    else msg = 'Puntata da ' + BET_MIN + ' a ' + BET_MAX + '.';
    if (elBetErr) {
      elBetErr.textContent = msg;
      elBetErr.classList.toggle('is-warn', balance < BET_MIN || bet > balance);
    }
    if (elSpin) elSpin.disabled = spinning || balance < BET_MIN;
  }

  betBtns.forEach((b) => b.addEventListener('click', () => {
    if (spinning || b.disabled) return;
    if (sound) { sound.unlock(); sound.click(); }
    setBet(parseInt(b.dataset.bet, 10));
  }));

  if (elBetInput) {
    // Mentre si digita non correggiamo il valore (scrivere "100" passa per "1"
    // e "10": riscriverlo sotto le dita è insopportabile). Si sistema all'uscita.
    elBetInput.addEventListener('input', () => {
      if (spinning) return;
      const v = parseInt(elBetInput.value, 10);
      if (Number.isFinite(v)) setBet(v, { silent: true });
    });
    elBetInput.addEventListener('change', () => setBet(parseInt(elBetInput.value, 10)));
    elBetInput.addEventListener('blur', () => setBet(parseInt(elBetInput.value, 10)));
    elBetInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      setBet(parseInt(elBetInput.value, 10));
      elBetInput.blur();
    });
  }
  function step(delta) {
    if (spinning) return;
    if (sound) { sound.unlock(); sound.click(); }
    // Arrotonda al multiplo di 5 così i tocchi ripetuti danno numeri tondi
    const base = Math.round(bet / BET_STEP) * BET_STEP;
    setBet(base + delta);
  }
  if (elBetMinus) elBetMinus.addEventListener('click', () => step(-BET_STEP));
  if (elBetPlus) elBetPlus.addEventListener('click', () => step(BET_STEP));
  if (elBetMax) elBetMax.addEventListener('click', () => {
    if (spinning) return;
    if (sound) { sound.unlock(); sound.click(); }
    setBet(maxBet());
  });

  setBet(bet);

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
    if (sound) sound.unlock();
    if (balance < bet) {
      elOutcome.innerHTML = '<span class="lose">Punti insufficienti per questa puntata.</span>';
      if (sound) sound.error();
      return;
    }
    if (sound) sound.click();
    spinning = true; elOutcome.textContent = '';
    refreshBets();   // blocca puntata e Gira mentre girano i rulli
    reels.forEach((r) => r.classList.remove('win'));

    fetch('/slot/gira', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ bet: String(bet), _csrf: csrf }),
    }).then((rs) => rs.json().then((data) => ({ ok: rs.ok, data }))).then(({ ok, data }) => {
      if (!ok || !data.ok) {
        elOutcome.innerHTML = '<span class="lose">' + (data && data.message ? data.message : 'Errore, riprova.') + '</span>';
        if (sound) sound.error();
        spinning = false; refreshBets();
        return;
      }
      const durs = [1500, 1950, 2450];
      data.reels.forEach((k, i) => spinReel(reels[i], k, durs[i]));

      // Ticking ritmato mentre i rulli girano (rallenta man mano che si avvicina lo stop)
      let tickTimer = null;
      if (sound) {
        let elapsed = 0;
        const scheduleTick = () => {
          sound.tick();
          elapsed += 1;
          const remaining = durs[2] - elapsed * 90;
          if (remaining > 60) tickTimer = setTimeout(scheduleTick, remaining < 260 ? 140 : 90);
        };
        scheduleTick();
      }
      // Un "clack" meccanico quando ciascun rullo si ferma
      durs.forEach((d, i) => setTimeout(() => { if (sound) sound.reelStop(i); }, d));

      setTimeout(() => {
        if (tickTimer) clearTimeout(tickTimer);
        spinning = false;          // prima di setBalance: e' refreshBets a riabilitare Gira
        setBalance(data.balance);
        showOutcome(data);
        if (data.jackpot) { arcadeFlash('JACKPOT!'); if (sound) sound.jackpot(); }
        else if (data.win && data.kind === 'tris') { arcadeFlash('TRIS!'); if (sound) sound.win(); }
        else if (data.win) { if (sound) sound.win(); }
      }, durs[2] + 180);
    }).catch(() => {
      elOutcome.innerHTML = '<span class="lose">Connessione assente. Riprova.</span>';
      if (sound) sound.error();
      spinning = false; refreshBets();
    });
  }

  elSpin.addEventListener('click', spin);
})();
