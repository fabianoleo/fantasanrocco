// ===================================================================
// FantaSanRocco — SLOT «Tombola di San Rocco» · 5 colonne × 4 righe
// -------------------------------------------------------------------
// Tutta la matematica sta qui e gira SOLO sul server. Il browser riceve
// il risultato già deciso: disegna e basta.
//
// COME SI TIRA UNA GIOCATA
// Ogni colonna ha una sua STRISCIA di simboli. Si estrae una posizione
// di stop e si leggono 4 simboli consecutivi (con avvolgimento). Non si
// estrae simbolo per simbolo: la striscia permette di decidere quanto
// spesso esce ogni cosa e quanto si ammucchia, che è quello che rende
// una slot una slot e non un lancio di dadi.
//
// I SIMBOLI SONO SU DUE LIVELLI, e si vedono diversi
//   BASSI  A K Q J 10  — lettere piatte, pagano poco
//   ALTI   percoca, vino, braciola, fuoco, san rocco — figure, pagano molto
// più il JOLLY (sostituisce tutto tranne il cane) e il CANE (il bonus).
//
// IL RITORNO È SOTTO IL 100% DI PROPOSITO
// A lungo andare chi gioca perde: è il senso di una slot dentro un gioco
// a punti, altrimenti diventa una macchina per stampare classifica.
// Il valore vero NON è stimato a occhio: si misura con strumenti/slot_rtp.js,
// che tira milioni di giocate e conta. Se tocchi pesi o tabella, RILANCIALO.
// ===================================================================

const COLONNE = 5;
const RIGHE = 4;

// ── Simboli ────────────────────────────────────────────────────────
// `alto: true` → figura disegnata dentro la cornice; gli altri sono lettere.
const SIMBOLI = {
  dieci:    { label: '10', alto: false },
  jack:     { label: 'J',  alto: false },
  donna:    { label: 'Q',  alto: false },
  re:       { label: 'K',  alto: false },
  asso:     { label: 'A',  alto: false },
  percoca:  { label: 'Percoca',   alto: true },
  vino:     { label: 'Vino',      alto: true },
  braciola: { label: 'Braciola',  alto: true },
  fuoco:    { label: 'Fuochi',    alto: true },
  sanrocco: { label: 'San Rocco', alto: true },
  jolly:    { label: 'Jolly',     alto: true, jolly: true },
  cane:     { label: 'Il Cane',   alto: true, bonus: true },
};

// ── Tabella dei pagamenti ──────────────────────────────────────────
// Quanto paga una fila di uguali su una linea, in "unità di linea".
// I simboli BASSI pagano gia' da 2, pochissimo: e' quello che fa vincere
// qualcosa spesso invece che tanto quasi mai. Senza, il 92% delle giocate
// non pagava niente e la slot sembrava rotta — la vecchia, che pagava le
// coppie, pagava sul 34% delle giocate.
// La puntata si divide sulle 20 linee, quindi una vincita da 100 unità su
// una puntata da 20 punti rende 100 × 20 / 20 = 100 punti.
const PAGAMENTI = {
  dieci:    { 2: 1, 3: 7,  4: 20,  5: 51 },
  jack:     { 2: 1, 3: 7,  4: 20,  5: 51 },
  donna:    { 2: 2, 3: 9,  4: 27,  5: 68 },
  re:       { 2: 2, 3: 9,  4: 27,  5: 68 },
  asso:     { 2: 3, 3: 10,  4: 34,  5: 85 },
  percoca:  { 3: 17,  4: 60,  5: 153 },
  vino:     { 3: 24,  4: 85, 5: 222 },
  braciola: { 3: 31,  4: 119, 5: 323 },
  fuoco:    { 3: 51,  4: 204, 5: 596 },
  sanrocco: { 3: 102, 4: 426, 5: 1362 },
  jolly:    { 3: 102, 4: 426, 5: 1362 },
};

// ── Le 20 linee ────────────────────────────────────────────────────
// Ogni linea dice, per ciascuna delle 5 colonne, quale riga tocca.
// Si leggono SEMPRE da sinistra e devono partire dalla prima colonna:
// è la regola classica, e senza di essa il conto delle vincite esplode.
const LINEE = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [3, 3, 3, 3, 3],
  [0, 1, 2, 1, 0], [3, 2, 1, 2, 3], [1, 0, 0, 0, 1], [2, 3, 3, 3, 2],
  [0, 0, 1, 2, 2], [3, 3, 2, 1, 1], [1, 2, 3, 2, 1], [2, 1, 0, 1, 2],
  [0, 1, 1, 1, 0], [3, 2, 2, 2, 3], [1, 1, 0, 1, 1], [2, 2, 3, 2, 2],
  [0, 1, 0, 1, 0], [3, 2, 3, 2, 3], [1, 2, 1, 2, 1], [2, 1, 2, 1, 2],
];

// ── Le strisce ─────────────────────────────────────────────────────
// Una per colonna. Le figure e il jolly sono rari; il cane è rarissimo e
// NON sta su tutte le colonne, altrimenti il bonus partirebbe di continuo.
// Le proporzioni qui dentro sono la vera manopola del ritorno.
function striscia(pezzi) {
  const out = [];
  for (const [sym, quante] of Object.entries(pezzi)) {
    for (let i = 0; i < quante; i++) out.push(sym);
  }
  return out;
}

const STRISCE = [
  // colonna 1
  striscia({ dieci: 15, jack: 14, donna: 9, re: 9, asso: 8,
             percoca: 5, vino: 4, braciola: 3, fuoco: 2, sanrocco: 1, jolly: 2, cane: 2 }),
  // colonna 2
  striscia({ dieci: 15, jack: 14, donna: 9, re: 9, asso: 8,
             percoca: 5, vino: 4, braciola: 3, fuoco: 2, sanrocco: 1, jolly: 3 }),
  // colonna 3
  striscia({ dieci: 15, jack: 14, donna: 9, re: 9, asso: 8,
             percoca: 5, vino: 4, braciola: 3, fuoco: 2, sanrocco: 1, jolly: 3, cane: 2 }),
  // colonna 4
  striscia({ dieci: 15, jack: 14, donna: 9, re: 9, asso: 8,
             percoca: 5, vino: 4, braciola: 3, fuoco: 2, sanrocco: 1, jolly: 3 }),
  // colonna 5
  striscia({ dieci: 15, jack: 14, donna: 9, re: 9, asso: 8,
             percoca: 5, vino: 4, braciola: 3, fuoco: 2, sanrocco: 1, jolly: 2, cane: 2 }),
];

// ── Il bonus: «La Corsa del Cane» ──────────────────────────────────
// Tre cani in vista e parte la corsa. Il cane si mette sulla colonna più a
// destra dov'è uscito e CAMMINA verso sinistra, una colonna per respin,
// facendo da jolly dove si trova. Ogni passo alza il moltiplicatore.
// Quando esce dal bordo sinistro la corsa finisce.
//
// Il cane NON lascia una scia di jolly dietro di sé, e non è un
// impoverimento: nel Wild Toro il wild CAMMINA, non si duplica. Provato
// con la scia, il bonus da solo rendeva il 288% — una macchina per
// stampare punti. Il numero sta in strumenti/slot_rtp.js, non a occhio.
//
// È il meccanismo di Wild Toro 2 (il toro che carica lasciando wild dietro,
// con respin a ogni passo e moltiplicatore che sale), portato su San Rocco:
// lì è un toro che insegue il matador, qui è il cane che nella tradizione
// portava il pane al santo malato.
const BONUS_MINIMO = 3;                       // quanti cani servono
const BONUS_MOLTIPLICATORI = [1, 2, 2, 3, 4]; // uno per passo

function pesca(rand, n) { return Math.floor(rand() * n); }

// Una colonna: si sceglie dove si ferma la striscia e si leggono 4 simboli.
function colonna(rand, idx) {
  const s = STRISCE[idx];
  const stop = pesca(rand, s.length);
  const out = [];
  for (let r = 0; r < RIGHE; r++) out.push(s[(stop + r) % s.length]);
  return out;
}

// griglia[colonna][riga]
function tiraGriglia(rand) {
  const g = [];
  for (let c = 0; c < COLONNE; c++) g.push(colonna(rand, c));
  return g;
}

function eSostituibile(sym) { return sym !== 'cane'; }

// Valuta le 20 linee. Torna le vincite in unità di linea.
function valutaLinee(griglia) {
  const vincite = [];
  let totale = 0;
  for (let i = 0; i < LINEE.length; i++) {
    const linea = LINEE[i];
    const primo = griglia[0][linea[0]];
    // Una linea che parte col cane non paga: il bonus non sta sulle linee.
    if (primo === 'cane') continue;
    // Il simbolo della linea è il primo non-jolly; con soli jolly vale jolly.
    let sym = primo;
    let c = 0;
    if (sym === 'jolly') {
      while (c < COLONNE && griglia[c][linea[c]] === 'jolly') c++;
      sym = (c < COLONNE && eSostituibile(griglia[c][linea[c]])) ? griglia[c][linea[c]] : 'jolly';
    }
    // Quanti in fila da sinistra, contando i jolly come il simbolo.
    let quanti = 0;
    for (let k = 0; k < COLONNE; k++) {
      const s = griglia[k][linea[k]];
      if (s === sym || s === 'jolly') quanti++;
      else break;
    }
    const tab = PAGAMENTI[sym];
    if (!tab || !tab[quanti]) continue;   // sotto il minimo del simbolo: niente
    // Cinque jolly veri pagano come cinque jolly; per il resto vale il simbolo.
    const unita = tab[quanti];
    vincite.push({ linea: i, sym, quanti, unita });
    totale += unita;
  }
  return { vincite, totale };
}

function contaCani(griglia) {
  let n = 0;
  const dove = [];
  for (let c = 0; c < COLONNE; c++) {
    for (let r = 0; r < RIGHE; r++) {
      if (griglia[c][r] === 'cane') { n++; dove.push({ c, r }); }
    }
  }
  return { n, dove };
}

// La corsa: il cane parte dalla colonna più a destra dov'è uscito e cammina
// verso sinistra. A ogni passo le altre colonne rigirano, la scia dietro di
// lui resta jolly, e il moltiplicatore sale.
function corsaDelCane(rand, dove) {
  const partenza = dove.reduce((a, b) => (b.c > a.c ? b : a));
  let col = partenza.c;
  const riga = partenza.r;
  const passi = [];
  let totale = 0;
  let step = 0;

  while (col >= 0) {
    const g = tiraGriglia(rand);
    g[col][riga] = 'jolly';       // il cane fa da jolly dove si trova
    const mult = BONUS_MOLTIPLICATORI[Math.min(step, BONUS_MOLTIPLICATORI.length - 1)];
    const { vincite, totale: t } = valutaLinee(g);
    const vinto = t * mult;
    totale += vinto;
    passi.push({ griglia: g, cane: { c: col, r: riga }, mult, vincite, unita: vinto });
    col--; step++;
  }
  return { passi, totale };
}

// Una giocata completa. `rand` si passa da fuori: il server usa il generatore
// crittografico, la simulazione uno veloce.
function gioca(rand) {
  const griglia = tiraGriglia(rand);
  const base = valutaLinee(griglia);
  const cani = contaCani(griglia);
  let bonus = null;
  let unita = base.totale;
  if (cani.n >= BONUS_MINIMO) {
    bonus = corsaDelCane(rand, cani.dove);
    unita += bonus.totale;
  }
  return { griglia, vincite: base.vincite, cani: cani.dove, bonus, unita };
}

// Unità di linea → punti veri. La puntata si divide sulle 20 linee.
function punti(unita, puntata) {
  return Math.floor(unita * puntata / LINEE.length);
}

module.exports = {
  COLONNE, RIGHE, SIMBOLI, PAGAMENTI, LINEE, STRISCE,
  BONUS_MINIMO, BONUS_MOLTIPLICATORI,
  tiraGriglia, valutaLinee, contaCani, corsaDelCane, gioca, punti,
};
