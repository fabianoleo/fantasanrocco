/* ===================================================================
   FantaSanRocco — Slot 5×4 «Tombola di San Rocco»
   Qui non si decide niente: la griglia, le vincite e il bonus arrivano
   già decisi dal server. Questo file fa girare le colonne, mette i
   simboli e racconta la Corsa del Cane.
   =================================================================== */
(function () {
  'use strict';

  const root = document.getElementById('slSlot');
  if (!root) return;

  const griglia   = document.getElementById('slGriglia');
  const spin      = document.getElementById('czSpin');
  const saldoEl   = document.getElementById('czBalance');
  const esitoEl   = document.getElementById('czOutcome');
  const errEl     = document.getElementById('czBetErr');
  const inp       = document.getElementById('czBetInput');
  const bonusBox  = document.getElementById('slBonus');
  const bonusMult = document.getElementById('slBonusMult');
  const csrf      = root.dataset.csrf;
  const MIN = Number(root.dataset.betMin) || 5;
  const MAX = Number(root.dataset.betMax) || 500;

  let puntata = Number(root.dataset.bet) || MIN;
  let gira = false;

  const celle = (c, r) => griglia.querySelector(`.sl-cella[data-col="${c}"][data-riga="${r}"]`);
  const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const TETTO_ANIMAZIONE = 12000;
  function conTetto(promessa, ms) {
    return Promise.race([promessa, attesa(ms)]);
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
    griglia.querySelectorAll('.sl-cella').forEach((c) => c.classList.remove('is-vinta', 'is-cane'));
  }

  // Accende le celle delle linee vincenti. Le linee arrivano dal server
  // come indice + quanti simboli: qui servono le coordinate, e le stesse
  // 20 linee stanno anche di qua per poterle disegnare.
  const LINEE = [
    [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[3,3,3,3,3],
    [0,1,2,1,0],[3,2,1,2,3],[1,0,0,0,1],[2,3,3,3,2],
    [0,0,1,2,2],[3,3,2,1,1],[1,2,3,2,1],[2,1,0,1,2],
    [0,1,1,1,0],[3,2,2,2,3],[1,1,0,1,1],[2,2,3,2,2],
    [0,1,0,1,0],[3,2,3,2,3],[1,2,1,2,1],[2,1,2,1,2],
  ];

  function accendi(vincite) {
    (vincite || []).forEach((v) => {
      const linea = LINEE[v.linea];
      if (!linea) return;
      for (let c = 0; c < v.quanti; c++) {
        const cella = celle(c, linea[c]);
        if (cella) cella.classList.add('is-vinta');
      }
    });
  }

  // La girata: ogni colonna si ferma un po' dopo la precedente, come una
  // slot vera. Durante il giro si mostrano simboli a caso — è solo scena,
  // il risultato è già deciso.
  const FINTI = ['dieci', 'jack', 'donna', 're', 'asso', 'percoca', 'vino', 'braciola'];

  async function giraColonne(g) {
    const cols = Array.from(griglia.querySelectorAll('.sl-col'));
    cols.forEach((col) => col.classList.add('is-gira'));
    for (let c = 0; c < cols.length; c++) {
      // qualche fotogramma di simboli a caso
      for (let t = 0; t < 3; t++) {
        for (let r = 0; r < 4; r++) metti(c, r, FINTI[Math.floor(Math.random() * FINTI.length)]);
        await attesa(45);
      }
      for (let r = 0; r < 4; r++) metti(c, r, g[c][r]);
      cols[c].classList.remove('is-gira');
      await attesa(90);
    }
  }

  async function corsa(bonus) {
    bonusBox.hidden = false;
    for (const passo of bonus.passi) {
      bonusMult.textContent = '×' + passo.mult;
      pulisci();
      disegna(passo.griglia);
      const cella = celle(passo.cane.c, passo.cane.r);
      if (cella) cella.classList.add('is-cane');
      accendi(passo.vincite);
      await attesa(passo.vincite.length ? 1100 : 700);
    }
    bonusBox.hidden = true;
  }

  function leggiPuntata() {
    let v = parseInt(inp.value, 10);
    if (!Number.isInteger(v)) v = MIN;
    v = Math.max(MIN, Math.min(MAX, v));
    inp.value = v;
    puntata = v;
    return v;
  }

  async function giocata() {
    if (gira) return;
    const bet = leggiPuntata();
    gira = true;
    spin.disabled = true;
    errEl.textContent = '';
    esitoEl.textContent = '';
    pulisci();

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
      gira = false; spin.disabled = false; return;
    }
    if (!d.ok) {
      errEl.textContent = d.message || 'Giocata non riuscita.';
      gira = false; spin.disabled = false; return;
    }

    // se la scheda e' nascosta i timer si fermano: il tetto evita che la
    // giocata resti appesa per sempre
    await conTetto(giraColonne(d.griglia), TETTO_ANIMAZIONE);
    disegna(d.griglia);          // se l'animazione e' stata saltata, la griglia va messa comunque
    accendi(d.vincite);
    (d.cani || []).forEach((p) => {
      const cella = celle(p.c, p.r);
      if (cella) cella.classList.add('is-cane');
    });

    if (d.bonus) {
      esitoEl.textContent = 'Tre cani! Parte la Corsa del Cane…';
      await attesa(900);
      await conTetto(corsa(d.bonus), TETTO_ANIMAZIONE);
      bonusBox.hidden = true;    // se la corsa e' stata saltata, il pannello va chiuso lo stesso
    }

    saldoEl.textContent = d.balance;
    if (d.payout > 0) {
      esitoEl.textContent = `Hai vinto ${d.payout} punti` + (d.bonus ? ` (di cui ${d.bonus.punti} dalla corsa)` : '') + '!';
      esitoEl.className = 'cz-outcome is-win';
    } else {
      esitoEl.textContent = 'Niente questa volta.';
      esitoEl.className = 'cz-outcome';
    }
    gira = false;
    spin.disabled = false;
  }

  spin.addEventListener('click', giocata);

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
