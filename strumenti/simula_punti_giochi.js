// ===================================================================
// FantaSanRocco — E se i mini-giochi dessero punti in classifica?
// -------------------------------------------------------------------
// Simula la regola PRIMA di applicarla: una percentuale del punteggio
// delle partite diventa punti di classifica, con un tetto giornaliero.
// Non scrive NIENTE: legge e basta.
//
//   node strumenti/simula_punti_giochi.js            1% · tetto 500
//   node strumenti/simula_punti_giochi.js 0.5 300    mezzo per cento, tetto 300
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

const PERC  = Number(process.argv[2] || 1);
const TETTO = Number(process.argv[3] || 500);
if (!Number.isFinite(PERC) || PERC <= 0 || !Number.isFinite(TETTO) || TETTO <= 0) {
  console.error('Uso: node strumenti/simula_punti_giochi.js [percentuale] [tetto giornaliero]');
  process.exit(1);
}

// Un giorno per giocatore: è l'unità su cui morde il tetto.
const giorni = db.prepare(`
  SELECT user_id, date(created_at) AS g, SUM(score) AS s, COUNT(*) AS partite
  FROM game_runs GROUP BY user_id, date(created_at)
`).all();

if (!giorni.length) {
  console.log('Nessuna partita registrata: non c\'è niente da simulare.');
  process.exit(0);
}

const per = {};
let totale = 0, tagliati = 0, persiDalTetto = 0;
for (const x of giorni) {
  const grezzo = Math.floor(x.s * PERC / 100);
  const dato = Math.min(grezzo, TETTO);
  if (grezzo > TETTO) { tagliati++; persiDalTetto += grezzo - dato; }
  per[x.user_id] = (per[x.user_id] || 0) + dato;
  totale += dato;
}

const nomi = Object.fromEntries(
  db.prepare('SELECT id, nickname FROM users').all().map((u) => [u.id, u.nickname])
);
const periodo = db.prepare('SELECT MIN(date(created_at)) a, MAX(date(created_at)) b FROM game_runs').get();
const perGioco = db.prepare(`
  SELECT game, COUNT(*) n, SUM(score) tot, ROUND(AVG(score)) media, MAX(score) record
  FROM game_runs GROUP BY game
`).all();

console.log(`REGOLA SIMULATA: ${PERC}% del punteggio · tetto ${TETTO} punti al giorno`);
console.log(`Partite dal ${periodo.a} al ${periodo.b}\n`);

console.log('LE PARTITE FINORA');
perGioco.forEach((g) => console.log(
  `  ${(g.game + '        ').slice(0, 8)} ${String(g.n).padStart(5)} partite · `
  + `totale ${g.tot} · media ${g.media} · record ${g.record}`));

console.log('\nQUANTO DISTRIBUIREBBE');
console.log(`  punti in tutto            ${totale}`);
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
