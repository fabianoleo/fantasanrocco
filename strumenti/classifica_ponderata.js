// ===================================================================
// FantaSanRocco — Come sarebbe la classifica se la slot pesasse meno
// -------------------------------------------------------------------
// NON SCRIVE NIENTE. Simula e basta.
//
// Uso (in produzione, dentro il container):
//   cd /app && node strumenti/classifica_ponderata.js 0.1 0.25 0.5
//   cd /app && node strumenti/classifica_ponderata.js --solo-guadagni 0.1 0.25
//
// DUE MODI DI PONDERARE, e la differenza non è tecnica, è politica:
//
//   SIMMETRICO (default) — il netto della slot vale `peso` in classifica,
//   sia in guadagno sia in perdita. Chi ha vinto scende, ma chi ha PERSO
//   RISALE: gli torna indietro la parte di perdita che non conta più.
//   È la ponderazione vera: "la slot conta un decimo, in bene e in male".
//   Tocca centinaia di persone, quasi tutte in meglio.
//
//   SOLO GUADAGNI (--solo-guadagni) — si pondera solo chi è in attivo, le
//   perdite restano intere. Tocca pochissimi, ma è asimmetrico: a chi ha
//   perso 1.700 punti alla slot non torna niente, mentre a chi ne ha vinti
//   5.000 se ne tolgono 4.500. Difendibile, ma va detto chiaro, perché
//   qualcuno lo noterà.
//
// Il peso NON cambia il saldo con cui si gioca: cambia solo il punteggio
// che finisce in classifica. Sono due cose diverse e vanno spiegate come
// due cose diverse.
// ===================================================================
const { db } = require('../src/db');

const args = process.argv.slice(2);
const SOLO_GUADAGNI = args.includes('--solo-guadagni');
const PESI = args.map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 1);
if (!PESI.length) PESI.push(0.1);

const num = (v) => Math.round(v).toLocaleString('it-IT');
const QUANTI = 30;   // quante righe mostrare in cima

// Stessa formula di src/lib/classifica.js, altrimenti i confronti non tornano.
const righe = db.prepare(`
  SELECT u.id, u.nickname,
         COALESCE(SUM(CASE WHEN s.status='approved' THEN m.points ELSE 0 END), 0) + u.points_adjust AS punti,
         COALESCE(SUM(CASE WHEN s.status='approved' THEN m.points ELSE 0 END), 0) AS puntiMissioni,
         (u.game_best + u.jp_best) AS spareggio,
         u.created_at
  FROM users u
  LEFT JOIN submissions s ON s.user_id = u.id
  LEFT JOIN missions m    ON m.id = s.mission_id
  WHERE u.role = 'user'
  GROUP BY u.id
`).all();

const slotPer = new Map();
for (const r of db.prepare(
  "SELECT user_id, SUM(delta) AS netto, COUNT(*) AS giocate FROM punti_movimenti WHERE causa = 'slot' GROUP BY user_id"
).all()) slotPer.set(r.user_id, r);

const registrato = db.prepare('SELECT COALESCE(SUM(delta), 0) AS s FROM punti_movimenti').get().s;
const adjustTot = db.prepare("SELECT COALESCE(SUM(points_adjust), 0) AS s FROM users WHERE role = 'user'").get().s;

// Stesso ordine di src/lib/classifica.js: a pari punti passa avanti chi ne
// ha fatti di piu' con le missioni, poi i record dei mini-giochi, poi
// l'iscrizione. Se qui fosse diverso, le posizioni stampate non sarebbero
// quelle che la gente vede sul sito.
const ordina = (a, b) => (b.punti - a.punti) || (b.puntiMissioni - a.puntiMissioni)
  || (b.spareggio - a.spareggio) || (a.created_at < b.created_at ? -1 : 1);

const prima = righe.map((r) => ({ ...r })).sort(ordina);
const posPrima = new Map(prima.map((r, i) => [r.id, i + 1]));

const netti = [...slotPer.values()].map((s) => s.netto);
const vinto = netti.filter((n) => n > 0), perso = netti.filter((n) => n < 0);

console.log('');
console.log(`GIOCATORI: ${righe.length}`);
console.log(`Alla slot hanno giocato in ${slotPer.size}: ${vinto.length} in guadagno`
  + ` (+${num(vinto.reduce((a, b) => a + b, 0))} in tutto),`
  + ` ${perso.length} in perdita (${num(perso.reduce((a, b) => a + b, 0))} in tutto).`);
console.log(`Modo: ${SOLO_GUADAGNI ? 'SOLO GUADAGNI (le perdite restano intere)' : 'SIMMETRICO (conta anche chi ha perso)'}`);

for (const PESO of PESI) {
  console.log('');
  console.log('═'.repeat(80));
  console.log(`LA SLOT PESA ${(PESO * 100).toFixed(0)}% IN CLASSIFICA`
    + `${SOLO_GUADAGNI ? ' — solo sui guadagni' : ''}`);
  console.log('═'.repeat(80));

  const dopo = righe.map((r) => {
    const netto = slotPer.has(r.id) ? slotPer.get(r.id).netto : 0;
    // Quanto del netto slot SPARISCE dal punteggio. In simmetrico vale per
    // tutti; con --solo-guadagni solo per chi è sopra zero.
    const contato = (SOLO_GUADAGNI && netto < 0) ? netto : netto * PESO;
    const differenza = contato - netto;      // negativo = perde punti, positivo = ne riprende
    return { ...r, netto, differenza, punti: r.punti + differenza };
  }).sort(ordina);

  const scendono = dopo.filter((r) => r.differenza < -0.5);
  const salgono = dopo.filter((r) => r.differenza > 0.5);
  console.log(`Perdono punti: ${scendono.length} · ne riprendono: ${salgono.length}`
    + ` · invariati: ${righe.length - scendono.length - salgono.length}`);

  console.log('');
  console.log('pos  giocatore              punti ora  →   ponderati      slot   differenza   era');
  console.log('─'.repeat(80));
  dopo.slice(0, QUANTI).forEach((r, i) => {
    const era = posPrima.get(r.id);
    const fre = era === i + 1 ? '  ' : (era > i + 1 ? '▲' : '▼');
    console.log(
      String(i + 1).padStart(3),
      (r.nickname || '?').slice(0, 20).padEnd(22),
      num(r.punti - r.differenza).padStart(9),
      ' →',
      num(r.punti).padStart(11),
      num(r.netto).padStart(9),
      (r.differenza > 0 ? '+' + num(r.differenza) : num(r.differenza)).padStart(12),
      ` ${fre}${era}`
    );
  });

  // Chi ci guadagna di più: sono quelli a cui va spiegato meno, ma sono
  // anche quelli che rendono la modifica popolare invece che punitiva.
  const topSu = [...salgono].sort((a, b) => b.differenza - a.differenza).slice(0, 5);
  if (topSu.length) {
    console.log('');
    console.log('Ci guadagnano di più (avevano perso alla slot):');
    for (const r of topSu) {
      console.log(`   ${(r.nickname || '?').slice(0, 22).padEnd(24)} +${num(r.differenza)}`
        + `  (${num(r.punti - r.differenza)} → ${num(r.punti)}, dal ${posPrima.get(r.id)}º al ${dopo.indexOf(r) + 1}º)`);
    }
  }
  const topGiu = [...scendono].sort((a, b) => a.differenza - b.differenza).slice(0, 5);
  if (topGiu.length) {
    console.log('');
    console.log('Ci perdono di più (avevano vinto alla slot):');
    for (const r of topGiu) {
      console.log(`   ${(r.nickname || '?').slice(0, 22).padEnd(24)} ${num(r.differenza)}`
        + `  (${num(r.punti - r.differenza)} → ${num(r.punti)}, dal ${posPrima.get(r.id)}º al ${dopo.indexOf(r) + 1}º)`);
    }
  }

  console.log('');
  const np = dopo[0], vp = prima[0];
  console.log(np.id !== vp.id
    ? `⚠️  CAMBIA IL PRIMO: era ${vp.nickname} (${num(vp.punti)}), diventa ${np.nickname} (${num(np.punti)}).`
    : `Il primo resta ${np.nickname}: ${num(vp.punti)} → ${num(np.punti)}.`);
  console.log(`Posizioni che cambiano: ${dopo.filter((r, i) => posPrima.get(r.id) !== i + 1).length} su ${righe.length}.`);
}

console.log('');
if (adjustTot !== registrato) {
  console.log(`⚠️  ${num(Math.abs(adjustTot - registrato))} punti non hanno una causa nel registro`);
  console.log('    (movimenti anteriori al registro): non si sa se venissero dalla slot.');
}
console.log('Questo script non ha scritto niente.');
console.log('');
