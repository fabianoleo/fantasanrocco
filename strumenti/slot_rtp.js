// ===================================================================
// FantaSanRocco — Quanto rende davvero la slot
// -------------------------------------------------------------------
// Tira milioni di giocate e conta quanto torna indietro. Serve a NON
// tarare la slot a occhio: la tabella dei pagamenti da sola non dice
// niente finché non la incroci con quanto escono davvero i simboli.
//
// Uso:  node strumenti/slot_rtp.js [quante]
//
// Il numero che conta è il RITORNO: quanto dei punti puntati torna al
// giocatore. Sotto il 100% chi gioca perde a lungo andare, ed è quello
// che vogliamo. Il RESTO è il margine del banco.
// ===================================================================
const slot = require('../src/giochi/slot');

const QUANTE = Number(process.argv[2]) || 2000000;

// Generatore veloce e riproducibile (xorshift): la simulazione deve dare lo
// stesso risultato a ogni lancio, altrimenti non si capisce se una modifica
// ha spostato qualcosa o è solo rumore.
function generatore(seme) {
  let s = seme >>> 0;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

const rand = generatore(20260816);
const PUNTATA = 20;

let puntato = 0, vinto = 0;
let bonusPartiti = 0, unitaBonus = 0, unitaBase = 0;
let giocateVincenti = 0, maxVincita = 0;
const istogramma = { zero: 0, sotto: 0, pari: 0, sopra: 0, grosse: 0 };

for (let i = 0; i < QUANTE; i++) {
  const g = slot.gioca(rand);
  const p = slot.punti(g.unita, PUNTATA);
  puntato += PUNTATA;
  vinto += p;
  unitaBase += g.vincite.reduce((a, v) => a + v.unita, 0);
  if (g.bonus) { bonusPartiti++; unitaBonus += g.bonus.totale; }
  if (p > 0) giocateVincenti++;
  if (p > maxVincita) maxVincita = p;
  if (p === 0) istogramma.zero++;
  else if (p < PUNTATA) istogramma.sotto++;
  else if (p === PUNTATA) istogramma.pari++;
  else if (p < PUNTATA * 10) istogramma.sopra++;
  else istogramma.grosse++;
}

const pct = (x) => (x * 100).toFixed(2) + '%';
const rtp = vinto / puntato;

console.log(`\nSLOT «Tombola di San Rocco» — ${QUANTE.toLocaleString('it-IT')} giocate da ${PUNTATA} punti\n`);
console.log(`  RITORNO AL GIOCATORE   ${pct(rtp)}`);
console.log(`  margine del banco      ${pct(1 - rtp)}`);
console.log(`  ${rtp < 1 ? '✓ il giocatore perde a lungo andare' : '✗ ATTENZIONE: la slot regala punti'}`);
console.log('');
console.log(`  giocate che pagano      ${pct(giocateVincenti / QUANTE)}`);
console.log(`  bonus partiti           ${pct(bonusPartiti / QUANTE)}  (1 ogni ${Math.round(QUANTE / Math.max(1, bonusPartiti))} giocate)`);
console.log(`  quota del bonus         ${pct(unitaBonus / Math.max(1, unitaBase + unitaBonus))} del vinto`);
console.log(`  vincita più alta        ${maxVincita.toLocaleString('it-IT')} punti  (×${(maxVincita / PUNTATA).toFixed(0)})`);
console.log('');
console.log('  come finiscono le giocate');
console.log(`    niente               ${pct(istogramma.zero / QUANTE)}`);
console.log(`    meno della puntata   ${pct(istogramma.sotto / QUANTE)}`);
console.log(`    esatta               ${pct(istogramma.pari / QUANTE)}`);
console.log(`    fino a 10 volte      ${pct(istogramma.sopra / QUANTE)}`);
console.log(`    oltre 10 volte       ${pct(istogramma.grosse / QUANTE)}`);
console.log('');
