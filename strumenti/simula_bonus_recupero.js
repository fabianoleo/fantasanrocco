// ===================================================================
// FantaSanRocco — E se dessimo un bonus a chi sta sotto una soglia?
// -------------------------------------------------------------------
// Simula la missione «di recupero» annunciata sui social: tot punti a
// chi sta sotto una certa quota. Legge e basta, non scrive niente.
//
//   node strumenti/simula_bonus_recupero.js              2000 sotto 10000
//   node strumenti/simula_bonus_recupero.js 500 3000     500 sotto 3000
//
// IL PUNTO DA GUARDARE NON È LA CIMA, È IL GRADINO
// Se tutti quelli sotto soglia prendono la stessa cifra, fra di loro
// l'ordine non cambia: si alzano insieme. Il guaio sta sul bordo — chi
// sta appena SOPRA la soglia non prende niente e si vede superare da chi
// stava appena sotto. Quello è l'unico gruppo che ci perde davvero, e
// sono anche quelli che hanno giocato di più fra i due.
//
// Il conto è sul caso PEGGIORE: tutti gli aventi diritto la fanno. Nella
// realtà la fa solo chi vede l'annuncio, quindi l'effetto vero è minore.
// Ma una regola va pensata su cosa può succedere, non su cosa spera.
// ===================================================================
const { leaderboardRows } = require('../src/lib/classifica');

const BONUS  = Number(process.argv[2] || 2000);
const SOGLIA = Number(process.argv[3] || 10000);
if (![BONUS, SOGLIA].every((n) => Number.isFinite(n) && n > 0)) {
  console.error('Uso: node strumenti/simula_bonus_recupero.js [punti] [soglia]');
  process.exit(1);
}

const cl = leaderboardRows();
const perc = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

const aventiDiritto = cl.filter((u) => u.points < SOGLIA);
const esclusi = cl.filter((u) => u.points >= SOGLIA);

// «Sotto soglia» comprende due popolazioni molto diverse: chi gioca e sta
// indietro, e chi non ha mai mandato niente. La missione nasce per i secondi,
// ma la regola come è scritta paga anche i primi — e sono la maggioranza dei
// punti immessi. Vanno visti separati o il totale non dice niente.
const mai = aventiDiritto.filter((u) => u.done === 0).length;
const indietro = aventiDiritto.length - mai;

console.log(`REGOLA SIMULATA: +${BONUS} punti a chi sta sotto ${SOGLIA}\n`);
console.log('CHI NE HA DIRITTO');
console.log(`  iscritti in tutto          ${String(cl.length).padStart(4)}`);
console.log(`  sotto soglia (prendono)    ${String(aventiDiritto.length).padStart(4)}  ${perc(aventiDiritto.length, cl.length)}%`);
console.log(`     ├─ hanno giocato        ${String(indietro).padStart(4)}`);
console.log(`     └─ mai mandato niente   ${String(mai).padStart(4)}`);
console.log(`  sopra soglia (niente)      ${String(esclusi.length).padStart(4)}  ${perc(esclusi.length, cl.length)}%`);
console.log(`  punti immessi nel gioco    ${(aventiDiritto.length * BONUS).toLocaleString('it')}  (se la fanno tutti)`);

// ── IL GRADINO ──────────────────────────────────────────────────────
// Chi resta fuori per un soffio e viene scavalcato da chi stava sotto.
const dopo = cl.map((u) => ({
  id: u.id,
  nick: u.nickname,
  prima: u.points,
  dopo: u.points + (u.points < SOGLIA ? BONUS : 0),
  preso: u.points < SOGLIA,
})).sort((a, b) => b.dopo - a.dopo);

const scavalcati = esclusi.filter((e) => aventiDiritto.some((a) => a.points + BONUS > e.points));
console.log('\nIL GRADINO: CHI VIENE SUPERATO PUR AVENDO GIOCATO DI PIÙ');
console.log(`  stanno fra ${SOGLIA} e ${SOGLIA + BONUS} punti: ${scavalcati.length} persone`);
if (scavalcati.length) {
  scavalcati.slice(0, 10).forEach((e) => {
    const sopra = aventiDiritto.filter((a) => a.points + BONUS > e.points).length;
    console.log(`    ${(e.nickname + '                    ').slice(0, 20)} ${String(e.points).padStart(6)} pt`
      + `  → superato da ${sopra} person${sopra === 1 ? 'a' : 'e'} che stava${sopra === 1 ? '' : 'no'} sotto di lui`);
  });
  console.log('  → Sono loro che protesteranno, e con ragione: hanno fatto di più');
  console.log('    e finiscono dietro. Più il bonus è grande, più larga è la fascia.');
} else {
  console.log('  → Nessuno: il bonus è abbastanza piccolo da non scavalcare nessuno.');
}

// ── LA CLASSIFICA, PRIMA E DOPO ─────────────────────────────────────
console.log('\nI PRIMI QUINDICI, PRIMA E DOPO');
dopo.slice(0, 15).forEach((u, i) => {
  const posPrima = cl.findIndex((x) => x.id === u.id) + 1;
  const freccia = posPrima === i + 1 ? '  ' : (posPrima > i + 1 ? '↑ ' : '↓ ');
  console.log(`  ${String(i + 1).padStart(2)}. ${freccia}${(u.nick + '                    ').slice(0, 20)}`
    + ` ${String(u.prima).padStart(6)} → ${String(u.dopo).padStart(6)}`
    + (u.preso ? `  (+${BONUS})` : '        ')
    + (posPrima === i + 1 ? '' : `   era ${posPrima}º`));
});

const vincePrima = cl[0] ? cl[0].nickname : null;
const vinceDopo = dopo[0] ? dopo[0].nick : null;
console.log(`\n  Primo in classifica: ${vincePrima === vinceDopo
  ? vincePrima + ' — non cambia' : vincePrima + ' → ' + vinceDopo + '  ⚠️ CAMBIA IL VINCITORE'}`);

// ── QUANTO VALE, IN MISSIONI ────────────────────────────────────────
const { MISSIONI, PTS } = require('../src/dati/missioni');
const media = Math.round(MISSIONI.reduce((a, x) => a + PTS[x.rar], 0) / MISSIONI.length);
const mediana = (() => {
  const v = cl.map((u) => u.points).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
})();
console.log('\nQUANTO VALE QUESTO BONUS');
console.log(`  una missione media vale        ${String(media).padStart(5)} punti`);
console.log(`  il bonus equivale a            ${String(Math.round(BONUS / media)).padStart(5)} missioni`);
console.log(`  il giocatore mediano ha        ${String(mediana).padStart(5)} punti in tutto`);
if (BONUS > mediana) {
  console.log('  ⚠️  Il bonus è PIÙ GRANDE di quanto ha guadagnato metà classifica');
  console.log('      in tutta la festa. Una sola azione varrebbe più di giorni di gioco.');
} else {
  console.log('  → Il bonus sta sotto quello che ha già fatto metà classifica: regge.');
}
