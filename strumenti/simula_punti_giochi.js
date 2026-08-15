// ===================================================================
// FantaSanRocco — E se i mini-giochi dessero punti in classifica?
// -------------------------------------------------------------------
// Simula la regola PRIMA di applicarla: una percentuale del punteggio
// delle partite diventa punti di classifica, con un tetto giornaliero.
// Non scrive NIENTE: legge e basta.
//
//   node strumenti/simula_punti_giochi.js                1% e 1% · tetto 500
//   node strumenti/simula_punti_giochi.js 1 0.4 500      runner 1%, jetpack 0.4%
//   node strumenti/simula_punti_giochi.js 0.5 300        stessa % per tutti e due
//
// LE DUE PERCENTUALI SONO SEPARATE, E NON È UN VEZZO
// In game_runs la colonna `score` non è la stessa cosa per i due giochi:
// per il runner sono PUNTI, per il jetpack sono METRI (vedi db.js). Un volo
// medio fa 1118 metri, una partita media al runner 471 punti: applicando la
// stessa percentuale a tutti e due, il jetpack si prende l'82% del bonus
// solo perché i suoi numeri sono più grandi. Non perché sia più difficile.
//
// PERCHÉ SUL PUNTEGGIO E NON SULLE MONETE
// Le monete non esistono per il server: il browser manda solo il
// punteggio, e le monete ci sono già dentro (15 punti l'una). Contarle a
// parte vorrebbe dire un dato nuovo che arriva dal client, quindi un
// tetto anti-imbroglio nuovo da calcolare sulla fisica del gioco. Il
// punteggio invece è già validato dal server contro il tempo reale.
//
// FIN DOVE ARRIVA IL RETROATTIVO
// game_runs nasce il 29 luglio 2026, per le statistiche. Le partite
// precedenti non ci sono: di quelle restano solo il record personale e
// il conteggio, non le singole giocate. Il retroattivo parte da lì.
// ===================================================================
const { db } = require('../src/db');

const arg = process.argv.slice(2).map(Number);
// Tre numeri = runner, jetpack, tetto. Due = stessa percentuale per entrambi.
const [P_RUNNER, P_JETPACK, TETTO] = arg.length >= 3
  ? [arg[0], arg[1], arg[2]]
  : arg.length === 2 ? [arg[0], arg[0], arg[1]]
  : [1, 1, 500];
const PERC = { runner: P_RUNNER, jetpack: P_JETPACK };
if (![P_RUNNER, P_JETPACK, TETTO].every((n) => Number.isFinite(n) && n > 0)) {
  console.error('Uso: node strumenti/simula_punti_giochi.js [%runner] [%jetpack] [tetto giornaliero]');
  process.exit(1);
}

const righe = db.prepare(`
  SELECT user_id, date(created_at) AS g, game, SUM(score) AS s, COUNT(*) AS partite
  FROM game_runs GROUP BY user_id, date(created_at), game
`).all();
// Un giorno per giocatore: è l'unità su cui morde il tetto, e ci confluiscono
// tutti e due i giochi — ognuno con la SUA percentuale.
const mappa = new Map();
for (const r of righe) {
  const k = r.user_id + '|' + r.g;
  const v = mappa.get(k) || { user_id: r.user_id, g: r.g, grezzo: 0, perGioco: {} };
  const p = Math.floor(r.s * (PERC[r.game] || 0) / 100);
  v.grezzo += p;
  v.perGioco[r.game] = (v.perGioco[r.game] || 0) + p;
  mappa.set(k, v);
}
const giorni = [...mappa.values()];

if (!giorni.length) {
  console.log('Nessuna partita registrata: non c\'è niente da simulare.');
  process.exit(0);
}

const per = {};
const daGioco = {};
let totale = 0, tagliati = 0, persiDalTetto = 0;
for (const x of giorni) {
  const dato = Math.min(x.grezzo, TETTO);
  if (x.grezzo > TETTO) { tagliati++; persiDalTetto += x.grezzo - dato; }
  per[x.user_id] = (per[x.user_id] || 0) + dato;
  totale += dato;
  // Quota di ogni gioco sul grezzo, per dire da dove arriva il bonus.
  for (const [g, v] of Object.entries(x.perGioco)) {
    daGioco[g] = (daGioco[g] || 0) + (x.grezzo ? Math.round(dato * v / x.grezzo) : 0);
  }
}

const nomi = Object.fromEntries(
  db.prepare('SELECT id, nickname FROM users').all().map((u) => [u.id, u.nickname])
);
const periodo = db.prepare('SELECT MIN(date(created_at)) a, MAX(date(created_at)) b FROM game_runs').get();
const perGioco = db.prepare(`
  SELECT game, COUNT(*) n, SUM(score) tot, ROUND(AVG(score)) media, MAX(score) record
  FROM game_runs GROUP BY game
`).all();

console.log(`REGOLA SIMULATA: runner ${P_RUNNER}% · jetpack ${P_JETPACK}% · tetto ${TETTO} punti al giorno`);
if (P_RUNNER === P_JETPACK) {
  console.log('⚠️  Stessa percentuale per tutti e due, ma il punteggio del jetpack sono METRI');
  console.log('    e quello del runner sono PUNTI: numeri più grandi, bonus più grande.');
}
console.log(`Partite dal ${periodo.a} al ${periodo.b}\n`);

console.log('LE PARTITE FINORA');
perGioco.forEach((g) => console.log(
  `  ${(g.game + '        ').slice(0, 8)} ${String(g.n).padStart(5)} partite · `
  + `${g.game === 'jetpack' ? 'metri' : 'punti'} in tutto ${g.tot} · media ${g.media} · record ${g.record}`
  + `  →  una partita media vale ${(g.media * (PERC[g.game] || 0) / 100).toFixed(1)} punti`));

console.log('\nQUANTO DISTRIBUIREBBE');
console.log(`  punti in tutto            ${totale}`);
const somma = Object.values(daGioco).reduce((a, b) => a + b, 0) || 1;
Object.entries(daGioco).sort((a, b) => b[1] - a[1]).forEach(([g, v]) =>
  console.log(`    di cui da ${(g + '        ').slice(0, 8)} ${String(v).padStart(6)}  (${Math.round(v / somma * 100)}%)`));
console.log(`  giorni-giocatore          ${giorni.length}`);
console.log(`  giorni tagliati dal tetto ${tagliati}`
  + (tagliati ? `  (${Math.round(tagliati / giorni.length * 100)}% — persi ${persiDalTetto} punti)` : ''));
if (tagliati / giorni.length > 0.25) {
  console.log('  ⚠️  Il tetto morde su più di un giorno su quattro: così premia tutti');
  console.log('      uguale invece di premiare chi gioca. Valuta un tetto più alto.');
}

console.log('\nCHI CI GUADAGNA DI PIÙ');
Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 10)
  .forEach(([id, p], i) => console.log(`  ${String(i + 1).padStart(2)}. ${nomi[id] || ('#' + id)}: +${p}`));

// La domanda vera: la classifica cambierebbe di posizione?
try {
  const { leaderboardRows } = require('../src/lib/classifica');
  const cl = leaderboardRows();

  // Il numero che rende leggibile tutto il resto: quanto sono distanti i
  // primi fra loro. Se il bonus dei giochi è più grande di questo scarto,
  // la classifica la decide il bonus — qualunque percentuale si scelga.
  if (cl.length >= 10) {
    const scarto = cl[0].points - cl[9].points;
    const bonusMax = Math.max(...Object.values(per), 0);
    console.log(`\n  Scarto fra 1º e 10º in classifica: ${scarto} punti`);
    console.log(`  Bonus più alto che questa regola darebbe: ${bonusMax} punti`);
    console.log(bonusMax > scarto
      ? '  → il bonus è PIÙ GRANDE dello scarto: da solo riscrive la classifica.'
      : '  → il bonus sta dentro lo scarto: sposta, ma non ribalta.');
  }
  const dopo = cl.map((u) => ({ nick: u.nickname, prima: u.points, dopo: u.points + (per[u.id] || 0) }))
    .sort((a, b) => b.dopo - a.dopo);
  console.log('\nLA CLASSIFICA, PRIMA E DOPO');
  dopo.slice(0, 10).forEach((u, i) => {
    const posPrima = cl.findIndex((x) => x.nickname === u.nick) + 1;
    const freccia = posPrima === i + 1 ? '  ' : (posPrima > i + 1 ? '↑ ' : '↓ ');
    console.log(`  ${String(i + 1).padStart(2)}. ${freccia}${(u.nick + '                    ').slice(0, 20)}`
      + ` ${String(u.prima).padStart(5)} → ${String(u.dopo).padStart(5)}  (+${u.dopo - u.prima})`
      + (posPrima === i + 1 ? '' : `   era ${posPrima}º`));
  });
  const scambi = dopo.slice(0, 10).filter((u, i) => cl.findIndex((x) => x.nickname === u.nick) !== i).length;
  console.log(`\n  Posizioni cambiate nei primi dieci: ${scambi}`);
  if (scambi === 0) console.log('  → la regola non ribalta niente: è un condimento.');
  else if (scambi > 4) console.log('  → attenzione: così la classifica la decidono i mini-giochi, non le missioni.');
} catch (e) {
  console.log('\n(classifica non calcolabile: ' + e.message + ')');
}
