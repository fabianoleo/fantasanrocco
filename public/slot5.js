/* ===================================================================
   FantaSanRocco — Slot 5×4 «Tombola di San Rocco»
   Qui non si decide niente: la griglia, le vincite e il bonus arrivano
   già decisi dal server. Questo file fa girare i rulli, mette i simboli
   e racconta la Corsa del Cane.

   I rulli girano DAVVERO: ogni colonna è un nastro a cui si infilano
   celle sopra e che poi scende. Prima si scambiavano i simboli sul posto
   con una sfocatura sopra, e si vedeva che era finto — la griglia
   sfarfallava invece di scorrere.
   =================================================================== */
(function () {
  'use strict';

  const root = document.getElementById('slSlot');
  if (!root) return;

  const griglia    = document.getElementById('slGriglia');
  const spin       = document.getElementById('czSpin');
  const saldoEl    = document.getElementById('czBalance');
  const esitoEl    = document.getElementById('czOutcome');
  const errEl      = document.getElementById('czBetErr');
  const inp        = document.getElementById('czBetInput');
  const bonusBox   = document.getElementById('slBonus');
  const bonusSub   = document.getElementById('slBonusSub');
  const bonusPunti = document.getElementById('slBonusPunti');
  const scala      = document.getElementById('slScala');
  const csrf       = root.dataset.csrf;
  const MIN = Number(root.dataset.betMin) || 5;
  const MAX = Number(root.dataset.betMax) || 500;

  const suono = () => window.SlotSound || null;
  const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let puntata = Number(root.dataset.bet) || MIN;
  let gira = false;

  const colonne = () => Array.from(griglia.querySelectorAll('.sl-col'));
  const nastro  = (c) => griglia.querySelector(`.sl-col[data-col="${c}"] .sl-nastro`);
  const celle   = (c, r) => griglia.querySelector(`.sl-col[data-col="${c}"] .sl-cella[data-riga="${r}"]`);
  const attesa  = (ms) => new Promise((r) => setTimeout(r, ms));

  // Rete di sicurezza per la scheda in secondo piano.
  // I punti li toglie il SERVER appena parte la giocata, ma l'animazione qui
  // e' fatta di attese: se chi gioca cambia app o scheda a meta' giro, il
  // browser congela i timer e la schermata resta ferma su una griglia che
  // gira, col saldo gia' cambiato e nessun esito. Al ritorno riprenderebbe,
  // ma nel frattempo sembra bloccata.
  // Con questa, l'animazione ha un tetto di tempo: scaduto quello si salta
  // alla fine e il risultato si vede comunque. Il risultato NON dipende
  // dall'animazione — arriva gia' deciso dal server — quindi saltarla non
  // cambia una virgola di quello che si vince.
  const TETTO_ANIMAZIONE = 14000;
  function conTetto(promessa, ms) {
    return Promise.race([promessa, attesa(ms)]);
  }

  const RIGHE = 4;
  const LINEE_TOT = 20;

  // ── Disegno dei simboli ──────────────────────────────────────────
  function nuovaCella(sym, riga) {
    const d = document.createElement('div');
    d.className = 'sl-cella';
    if (riga !== undefined) d.dataset.riga = String(riga);
    const t = document.getElementById('sl-' + sym);
    if (t) d.appendChild(t.content.cloneNode(true));
    return d;
  }

  function metti(c, r, sym) {
    const t = document.getElementById('sl-' + sym);
    const cella = celle(c, r);
    if (!t || !cella) return;
    cella.innerHTML = '';
    cella.appendChild(t.content.cloneNode(true));
  }

  function disegna(g) {
    for (let c = 0; c < g.length; c++) {
      for (let r = 0; r < g[c].length; r++) metti(c, r, g[c][r]);
    }
  }

  function pulisci() {
    griglia.querySelectorAll('.sl-cella').forEach((c) => {
      c.classList.remove('is-vinta', 'is-cane', 'is-atterra');
    });
    colonne().forEach((col) => col.classList.remove('is-attesa'));
  }

  // Le 20 linee servono anche di qua per poter accendere le celle: dal
  // server arrivano come indice + quanti simboli, non come coordinate.
  const LINEE = [
    [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[3,3,3,3,3],
    [0,1,2,1,0],[3,2,1,2,3],[1,0,0,0,1],[2,3,3,3,2],
    [0,0,1,2,2],[3,3,2,1,1],[1,2,3,2,1],[2,1,0,1,2],
    [0,1,1,1,0],[3,2,2,2,3],[1,1,0,1,1],[2,2,3,2,2],
    [0,1,0,1,0],[3,2,3,2,3],[1,2,1,2,1],[2,1,2,1,2],
  ];

  // Le linee si accendono UNA ALLA VOLTA, non tutte insieme: con dieci
  // linee vincenti accese di colpo si illumina mezza griglia e non si
  // capisce che cosa ha pagato.
  async function accendi(vincite, aScalare) {
    const lista = vincite || [];
    if (!lista.length) return;
    if (calmo || !aScalare) {
      lista.forEach((v) => segna(v));
      return;
    }
    for (const v of lista) {
      segna(v);
      await attesa(Math.max(70, Math.min(220, 900 / lista.length)));
    }
  }

  function segna(v) {
    const linea = LINEE[v.linea];
    if (!linea) return;
    for (let c = 0; c < v.quanti; c++) {
      const cella = celle(c, linea[c]);
      if (cella) cella.classList.add('is-vinta');
    }
  }

  // ── Il rullo ─────────────────────────────────────────────────────
  // Un giro = si infilano RIGHE celle in cima al nastro, lo si sposta su
  // di altrettanto senza animazione, e poi lo si lascia scendere a zero.
  // Quello che si vede è il nastro che scorre di quattro caselle.
  const FINTI = ['lumino', 'tammorra', 'giostra', 'luminarie', 'campana',
                 'percoca', 'vino', 'braciola'];
  const aCaso = () => FINTI[Math.floor(Math.random() * FINTI.length)];

  // Ogni giocata ha il suo numero: se una girata viene abbandonata (scheda
  // in secondo piano, tetto di tempo scaduto) i rulli rimasti indietro se
  // ne accorgono e si fermano, invece di continuare a rimescolare una
  // griglia che nel frattempo mostra già il risultato.
  let generazione = 0;

  // Rimette ogni colonna in ordine: esattamente RIGHE celle, numerate.
  // È la rete che garantisce che una girata interrotta non lasci mai la
  // griglia con otto celle in una colonna e quattro nell'altra.
  function ripristina() {
    colonne().forEach((col) => {
      const n = col.querySelector('.sl-nastro');
      if (!n) return;
      n.style.transition = ''; n.style.transform = '';
      col.style.height = '';
      col.classList.remove('is-gira', 'is-attesa');
      while (n.children.length > RIGHE) n.lastElementChild.remove();
      while (n.children.length < RIGHE) n.appendChild(nuovaCella('lumino'));
      Array.from(n.children).forEach((e, i) => { e.dataset.riga = String(i); });
    });
  }

  // Un giro del nastro. Si usa l'API delle animazioni e non una transizione
  // CSS: `transitionend` qui non arrivava mai per il transform — l'unico
  // evento che risaliva era quello del background delle celle appena
  // inserite — e ogni giro finiva per scadenza, tre volte più lento del
  // dovuto, lasciando ogni tanto celle di troppo nella colonna.
  // `animate()` restituisce una promessa che finisce quando finisce davvero.
  function scorri(c, simboli, durata, curva) {
    const n = nastro(c);
    if (!n) return Promise.resolve();
    const vecchie = Array.from(n.children);
    if (!vecchie.length) return Promise.resolve();
    const passo = vecchie.length > 1
      ? vecchie[1].offsetTop - vecchie[0].offsetTop
      : vecchie[0].offsetHeight;
    const salto = passo * RIGHE;

    // Le nuove entrano in cima; le vecchie restano sotto e usciranno.
    for (let r = RIGHE - 1; r >= 0; r--) {
      n.insertBefore(nuovaCella(simboli[r]), n.firstChild);
    }

    const mia = generazione;
    const chiudi = () => {
      // Se nel frattempo la giocata è stata abbandonata non tocchiamo più
      // niente: la griglia l'ha già rimessa a posto ripristina(), e
      // rinumerare adesso lascerebbe due celle con la stessa riga — che poi
      // manda a vuoto l'accensione delle linee vincenti.
      if (mia !== generazione) return;
      vecchie.forEach((e) => e.remove());
      // Le superstiti sono le nuove: riprendono i numeri di riga.
      Array.from(n.children).forEach((e, i) => { e.dataset.riga = String(i); });
    };

    // Scheda in secondo piano: il browser sospende le animazioni, quindi non
    // c'è niente da mostrare e nessuno che guardi. Si salta il giro e si va
    // dritti al risultato, invece di aspettare una scadenza per ogni rullo e
    // far durare una giocata quindici secondi.
    if (document.hidden || typeof n.animate !== 'function') { chiudi(); return Promise.resolve(); }

    const anim = n.animate(
      [{ transform: `translateY(${-salto}px)` }, { transform: 'translateY(0)' }],
      { duration: durata, easing: curva, fill: 'none' }
    );
    // La scadenza non è un doppione della promessa: con la scheda in secondo
    // piano il browser SOSPENDE le animazioni, `finished` non arriva mai e il
    // giro resterebbe appeso per sempre. Così invece il nastro si chiude lo
    // stesso e la giocata arriva in fondo.
    return Promise.race([
      anim.finished.catch(() => {}),        // annullata: va bene lo stesso
      attesa(durata + 300).then(() => { try { anim.cancel(); } catch (e) {} }),
    ]).then(chiudi);
  }

  // Una colonna intera: qualche giro alla cieca e poi l'atterraggio con
  // i simboli veri, con un pizzico di rimbalzo alla fine.
  async function rullo(c, finali, giri, ritardo, mia) {
    await attesa(ritardo);
    if (mia !== generazione) return;
    const col = colonne()[c];
    if (col) {
      col.classList.add('is-gira');
      col.style.height = col.offsetHeight + 'px';   // così le celle in più non lo allungano
    }
    for (let i = 0; i < giri; i++) {
      if (mia !== generazione) return;
      const finti = [];
      for (let r = 0; r < RIGHE; r++) finti.push(aCaso());
      await scorri(c, finti, 78, 'linear');
    }
    if (col) col.classList.remove('is-gira');
    if (mia !== generazione) return;
    await scorri(c, finali, 440, 'cubic-bezier(.2,1.35,.42,1)');
    if (col) col.style.height = '';
    // L'atterraggio: le quattro celle rimbalzano appena.
    for (let r = 0; r < RIGHE; r++) {
      const cella = celle(c, r);
      if (cella) {
        cella.classList.add('is-atterra');
        setTimeout(() => cella.classList.remove('is-atterra'), 320);
      }
    }
    const s = suono();
    if (s && !s.isMuted()) s.reelStop(c);
  }

  // Quanti cani nelle prime `fino` colonne: serve per l'attesa.
  function caniFinoA(g, fino) {
    let n = 0;
    for (let c = 0; c < fino && c < g.length; c++) {
      for (let r = 0; r < g[c].length; r++) if (g[c][r] === 'cane') n++;
    }
    return n;
  }

  async function giraColonne(g, mia) {
    if (calmo) { disegna(g); return; }
    // Se i primi tre rulli hanno già due cani, il terzo può far partire il
    // bonus: quelli che restano rallentano e si accende la cornice. È
    // l'attesa delle slot vere, e qui è onesta — i cani ci sono davvero.
    const attesaBonus = caniFinoA(g, 3) >= 2;
    const corse = [];
    for (let c = 0; c < g.length; c++) {
      const lento = attesaBonus && c >= 3;
      if (lento) {
        const col = colonne()[c];
        if (col) col.classList.add('is-attesa');
      }
      corse.push(rullo(c, g[c], lento ? 16 : 6 + c * 2, c * 130, mia));
    }
    await Promise.all(corse);
    colonne().forEach((col) => col.classList.remove('is-attesa'));
  }

  // ── La Corsa del Cane ────────────────────────────────────────────
  function scalaAggiorna(passo) {
    if (!scala) return;
    Array.from(scala.children).forEach((li, i) => {
      li.classList.toggle('is-fatto', i < passo);
      li.classList.toggle('is-ora', i === passo);
    });
  }

  async function corsa(bonus, bet) {
    bonusBox.hidden = false;
    scalaAggiorna(-1);
    bonusPunti.textContent = '';
    let unita = 0;

    for (let i = 0; i < bonus.passi.length; i++) {
      const passo = bonus.passi[i];
      scalaAggiorna(i);
      bonusSub.textContent = passo.cane.c > 0
        ? `Colonna ${passo.cane.c + 1}: il cane fa da jolly, poi passa a sinistra`
        : 'Ultima colonna: dopo questa il cane esce e la corsa finisce';

      pulisci();
      disegna(passo.griglia);
      const cella = celle(passo.cane.c, passo.cane.r);
      if (cella) cella.classList.add('is-cane');
      await accendi(passo.vincite, false);

      // Punti maturati finora. Stesso conto del server — somma delle unità
      // per il moltiplicatore, e solo alla fine si arrotonda — quindi
      // all'ultimo passo il numero coincide con bonus.punti al centesimo.
      const unitaPasso = (passo.vincite || []).reduce((s, v) => s + v.unita, 0) * passo.mult;
      unita += unitaPasso;
      const finora = Math.floor(unita * bet / LINEE_TOT);
      bonusPunti.textContent = finora > 0 ? `${finora} punti dalla corsa` : 'Ancora niente';
      if (unitaPasso > 0) {
        const s = suono();
        if (s && !s.isMuted()) s.win();
      }

      await attesa(passo.vincite.length ? 1200 : 780);
    }
    scalaAggiorna(bonus.passi.length);
    await attesa(420);
    bonusBox.hidden = true;
  }

  // ── Il conteggio dei punti ───────────────────────────────────────
  // Il numero sale invece di saltare: è l'unico momento in cui si capisce
  // quanto si è vinto, e vale la pena farlo durare mezzo secondo.
  function conta(el, da, a, ms) {
    // `document.hidden`: con la scheda in secondo piano requestAnimationFrame
    // non viene MAI chiamato. Senza questo controllo il numero restava fermo
    // sullo zero di partenza — «Hai vinto 0 punti» col saldo già cresciuto —
    // e la promessa non si chiudeva più, lasciando bloccato il tasto Gira.
    if (calmo || da === a || document.hidden) { el.textContent = a; return Promise.resolve(); }
    return new Promise((risolvi) => {
      let finito = false;
      const chiudi = () => { if (finito) return; finito = true; el.textContent = a; risolvi(); };
      const inizio = performance.now();
      const passo = (ora) => {
        if (finito) return;
        const q = Math.min(1, (ora - inizio) / ms);
        const morbido = 1 - Math.pow(1 - q, 3);
        el.textContent = Math.round(da + (a - da) * morbido);
        if (q < 1) requestAnimationFrame(passo);
        else chiudi();
      };
      requestAnimationFrame(passo);
      // Rete: se la scheda sparisce a metà conteggio, il numero arriva lo
      // stesso al totale invece di restare a mezz'aria.
      setTimeout(chiudi, ms + 400);
    });
  }

  function leggiPuntata() {
    let v = parseInt(inp.value, 10);
    if (!Number.isInteger(v)) v = MIN;
    v = Math.max(MIN, Math.min(MAX, v));
    inp.value = v;
    puntata = v;
    return v;
  }

  // L'involucro esiste per una ragione sola: qualunque cosa vada storta là
  // dentro, il tasto «Gira» deve tornare cliccabile. Senza, un solo errore
  // imprevisto lasciava la slot bloccata e l'unico rimedio era ricaricare
  // la pagina — col saldo già scalato dal server.
  async function giocata() {
    if (gira) return false;
    gira = true;
    spin.disabled = true;
    let riuscita = false;
    try {
      riuscita = await giocataVera();
    } catch (e) {
      errEl.textContent = 'Qualcosa è andato storto. Riprova.';
    } finally {
      generazione++;             // ferma i rulli rimasti indietro
      ripristina();
      bonusBox.hidden = true;
      gira = false;
      spin.disabled = false;
    }
    return riuscita;
  }

  async function giocataVera() {
    const bet = leggiPuntata();
    errEl.textContent = '';
    esitoEl.textContent = '';
    esitoEl.className = 'cz-outcome';
    pulisci();

    const s = suono();
    if (s) { s.unlock(); if (!s.isMuted()) s.click(); }
    const saldoPrima = parseInt(saldoEl.textContent, 10) || 0;

    let d;
    try {
      const r = await fetch('/slot/gira', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ bet, _csrf: csrf }),
      });
      d = await r.json();
    } catch (e) {
      errEl.textContent = 'Connessione persa. Riprova.';
      return false;
    }
    if (!d.ok) {
      errEl.textContent = d.message || 'Giocata non riuscita.';
      if (s && !s.isMuted()) s.error();
      return false;
    }

    // se la scheda e' nascosta i timer si fermano: il tetto evita che la
    // giocata resti appesa per sempre
    const mia = ++generazione;
    await conTetto(giraColonne(d.griglia, mia), TETTO_ANIMAZIONE);
    generazione++;               // qualunque rullo ancora in giro si ferma qui
    ripristina();                // e la griglia torna comunque a 5×4 pulite
    disegna(d.griglia);          // se l'animazione e' stata saltata, la griglia va messa comunque
    (d.cani || []).forEach((p) => {
      const cella = celle(p.c, p.r);
      if (cella) cella.classList.add('is-cane');
    });
    await conTetto(accendi(d.vincite, true), 2200);

    if (d.bonus) {
      esitoEl.textContent = 'Tre cani! Parte la Corsa del Cane…';
      esitoEl.className = 'cz-outcome is-bonus';
      if (s && !s.isMuted()) s.jackpot();
      await attesa(1000);
      await conTetto(corsa(d.bonus, bet), TETTO_ANIMAZIONE);
      bonusBox.hidden = true;    // se la corsa e' stata saltata, il pannello va chiuso lo stesso
    }

    if (d.payout > 0) {
      esitoEl.className = 'cz-outcome is-win';
      esitoEl.innerHTML = 'Hai vinto <b class="cz-cifra" id="czCifra">0</b> punti'
        + (d.bonus ? ` <span class="cz-di-cui">di cui ${d.bonus.punti} dalla corsa</span>` : '');
      const cifra = document.getElementById('czCifra');
      if (s && !s.isMuted()) { d.payout >= bet * 10 ? s.jackpot() : s.win(); }
      await Promise.all([
        conta(cifra, 0, d.payout, 700),
        conta(saldoEl, saldoPrima, d.balance, 700),
      ]);
    } else {
      saldoEl.textContent = d.balance;
      esitoEl.textContent = 'Niente questa volta.';
      esitoEl.className = 'cz-outcome';
    }
    saldoEl.textContent = d.balance;
    return true;
  }

  spin.addEventListener('click', () => { fermaAuto(); giocata(); });

  // ── Auto ─────────────────────────────────────────────────────────
  // Gira da sola per un numero FISSO di giocate, non all'infinito. La slot
  // rende l'87,6% (misurato con strumenti/slot_rtp.js): un auto senza fine
  // lasciato acceso mentre si guarda altrove svuota il saldo, e non e'
  // quello che uno intende premendo un pulsante.
  //
  // Si ferma da sola anche quando: il saldo non copre piu' la puntata, una
  // giocata fallisce (rete caduta, puntata rifiutata), o si cambia scheda.
  // Senza il primo controllo continuerebbe a chiedere giocate che il server
  // rifiuta; senza il secondo martellerebbe su un errore che non passa.
  const autoBtn = document.getElementById('czAuto');
  const autoSel = document.getElementById('czAutoN');
  let autoRimaste = 0;

  function autoAggiorna() {
    if (!autoBtn) return;
    const attivo = autoRimaste > 0;
    autoBtn.classList.toggle('is-on', attivo);
    autoBtn.textContent = attivo ? 'Ferma (' + autoRimaste + ')' : 'Auto';
    autoBtn.setAttribute('aria-label', attivo ? 'Ferma le giocate automatiche' : 'Gioca automaticamente');
    if (autoSel) autoSel.disabled = attivo;
  }

  function fermaAuto() {
    if (!autoRimaste) return;
    autoRimaste = 0;
    autoAggiorna();
  }

  async function autoCiclo() {
    while (autoRimaste > 0) {
      const bet = leggiPuntata();
      const saldo = parseInt(saldoEl.textContent, 10) || 0;
      if (saldo < bet) {
        errEl.textContent = 'Punti finiti: l\u2019auto si ferma qui.';
        break;
      }
      autoRimaste--;
      autoAggiorna();
      const ok = await giocata();
      if (!ok) break;            // errore: fermarsi, non insistere
      if (autoRimaste > 0) await attesa(700);   // un respiro fra una e l'altra
    }
    autoRimaste = 0;
    autoAggiorna();
  }

  if (autoBtn) {
    autoBtn.addEventListener('click', () => {
      if (autoRimaste > 0) { fermaAuto(); return; }
      autoRimaste = parseInt(autoSel && autoSel.value, 10) || 10;
      autoAggiorna();
      autoCiclo();
    });
  }

  // Scheda nascosta: le animazioni si fermano e le giocate resterebbero
  // appese al tetto di tempo. Meglio smettere che scoprire dieci giocate
  // fatte mentre si era altrove.
  document.addEventListener('visibilitychange', () => { if (document.hidden) fermaAuto(); });

  // ── Puntata ──────────────────────────────────────────────────────
  document.querySelectorAll('.cz-bet').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.cz-bet').forEach((x) => x.classList.remove('sel'));
    b.classList.add('sel');
    inp.value = b.dataset.bet;
    leggiPuntata();
  }));
  const passo = (d) => { inp.value = Math.max(MIN, Math.min(MAX, (parseInt(inp.value, 10) || MIN) + d)); leggiPuntata(); };
  document.getElementById('czBetMinus').addEventListener('click', () => passo(-5));
  document.getElementById('czBetPlus').addEventListener('click', () => passo(5));
  document.getElementById('czBetMax').addEventListener('click', () => { inp.value = MAX; leggiPuntata(); });
  inp.addEventListener('change', leggiPuntata);
})();
