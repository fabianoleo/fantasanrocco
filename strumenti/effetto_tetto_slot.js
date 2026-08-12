// ===================================================================
// FantaSanRocco — Che succede se metto un tetto ai punti della slot
// -------------------------------------------------------------------
// NON SCRIVE NIENTE. Legge il registro dei movimenti, calcola quanto ha
// guadagnato ciascuno dalla slot, e mostra come sarebbe la classifica se
// il guadagno netto dalla slot fosse limitato a un tetto.
//
// Uso (in produzione, dentro il container):
//   cd /app && node strumenti/effetto_tetto_slot.js 3500
//   cd /app && node strumenti/effetto_tetto_slot.js 1750 2500 3500   (confronta)
//
// Il tetto è sul NETTO: vinto meno perso. Chi dalla slot è in perdita non
// viene toccato — non ha senso togliere punti a chi ne ha già lasciati lì.
// Chi è in guadagno oltre il tetto si vede tagliare solo l'eccedenza.
//
// ATTENZIONE a cosa NON si vede qui: i punti mossi PRIMA che esistesse il
// registro dei movimenti non hanno una causa, quindi non si possono
// attribuire alla slot. Se il gioco è ripartito da un reset, il registro è
// completo e questo avviso non riguarda nessuno; lo script lo dice
// esplicitamente in fondo, invece di lasciarlo intendere.
// ===================================================================
const { db } = require('../src/db');

const TETTI = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
if (!TETTI.length) TETTI.push(3500);

const num = (v) => Math.round(v).toLocaleString('it-IT');

// La classifica com'è adesso: stessa formula di src/lib/classifica.js
// (missioni approvate + points_adjust), altrimenti i confronti non tornano.
const righe = db.prepare(`
  SELECT u.id, u.nickname,
         COALESCE(SUM(CASE WHEN s.status='approved' THEN m.points ELSE 0 END), 0) + u.points_adjust AS punti,
         COUNT(CASE WHEN s.status='approved' THEN 1 END) AS missioni,
         COALESCE(SUM(CASE WHEN s.status='approved' THEN m.points ELSE 0 END), 0) AS puntiMissioni,
         (u.game_best + u.jp_best) AS spareggio,
         u.created_at
  FROM users u
  LEFT JOIN submissions s ON s.user_id = u.id
  LEFT JOIN missions m    ON m.id = s.mission_id
  WHERE u.role = 'user'
  GROUP BY u.id
`).all();

// Quanto ha fatto ciascuno alla slot, in positivo o in negativo.
const slotPer = new Map();
for (const r of db.prepare(
  "SELECT user_id, SUM(delta) AS netto, COUNT(*) AS giocate FROM punti_movimenti WHERE causa = 'slot' GROUP BY user_id"
).all()) slotPer.set(r.user_id, r);

// Quanto del saldo NON è spiegato dal registro: sono movimenti anteriori al
// registro stesso. Se è grosso, i conti qui sotto valgono meno e va detto.
const registrato = db.prepare('SELECT COALESCE(SUM(delta), 0) AS s FROM punti_movimenti').get().s;
const adjustTot = db.prepare("SELECT COALESCE(SUM(points_adjust), 0) AS s FROM users WHERE role = 'user'").get().s;

// Stesso ordine di src/lib/classifica.js: a pari punti passa avanti chi ne
// ha fatti di piu' con le missioni, poi i record dei mini-giochi, poi
// l'iscrizione. Se qui fosse diverso, le posizioni stampate non sarebbero
// quelle che la gente vede sul sito.
const ordina = (a, b) => (b.punti - a.punti) || (b.puntiMissioni - a.puntiMissioni)
  || (b.spareggio - a.spareggio) || (a.created_at < b.created_at ? -1 : 1);

const prima = righe.map((r) => ({ ...r })).sort(ordina);
const posizionePrima = new Map(prima.map((r, i) => [r.id, i + 1]));

console.log('');
console.log('GIOCATORI:', righe.length);
const chiGioca = righe.filter((r) => slotPer.has(r.id));
const inGuadagno = chiGioca.filter((r) => slotPer.get(r.id).netto > 0);
console.log('Hanno giocato alla slot:', chiGioca.length,
  `(${inGuadagno.length} in guadagno, ${chiGioca.length - inGuadagno.length} in perdita)`);
if (chiGioca.length) {
  const netti = chiGioca.map((r) => slotPer.get(r.id).netto).sort((a, b) => b - a);
  console.log('Netto slot — massimo:', num(netti[0]), '· mediano:', num(netti[Math.floor(netti.length / 2)]),
    '· minimo:', num(netti[netti.length - 1]));
}

for (const TETTO of TETTI) {
  console.log('');
  console.log('═'.repeat(72));
  console.log(`TETTO ${num(TETTO)} PUNTI DALLA SLOT SU TUTTA LA FESTA`);
  console.log('═'.repeat(72));

  const dopo = righe.map((r) => {
    const s = slotPer.get(r.id);
    const netto = s ? s.netto : 0;
    const taglio = netto > TETTO ? netto - TETTO : 0;
    return { ...r, netto, taglio, punti: r.punti - taglio };
  }).sort(ordina);

  const toccati = dopo.filter((r) => r.taglio > 0);
  console.log(`Toccati dal tetto: ${toccati.length} giocatori su ${righe.length}`);
  if (toccati.length) {
    console.log(`Punti tolti in tutto: ${num(toccati.reduce((a, r) => a + r.taglio, 0))}`);
  }

  console.log('');
  console.log('pos  giocatore            punti ora   →   con il tetto     dalla slot   tolti   era');
  console.log('─'.repeat(88));
  // TUTTA la classifica, non i primi tot: il tetto puo' spostare qualcuno a
  // meta' elenco, e vedere solo il podio nasconderebbe proprio quel caso.
  dopo.forEach((r, i) => {
    const eraPos = posizionePrima.get(r.id);
    const freccia = eraPos === i + 1 ? '  ' : (eraPos > i + 1 ? '▲' : '▼');
    console.log(
      String(i + 1).padStart(3),
      (r.nickname || '?').slice(0, 18).padEnd(20),
      num(r.punti + r.taglio).padStart(10),
      '  →',
      num(r.punti).padStart(12),
      num(r.netto).padStart(13),
      (r.taglio ? '-' + num(r.taglio) : '—').padStart(8),
      ` ${freccia}${eraPos}`
    );
  });

  const nuovoPrimo = dopo[0], vecchioPrimo = prima[0];
  console.log('');
  if (nuovoPrimo.id !== vecchioPrimo.id) {
    console.log(`⚠️  CAMBIA IL PRIMO: era ${vecchioPrimo.nickname} (${num(vecchioPrimo.punti)}),`
      + ` diventa ${nuovoPrimo.nickname} (${num(nuovoPrimo.punti)}).`);
  } else {
    console.log(`Il primo resta ${nuovoPrimo.nickname}: ${num(vecchioPrimo.punti)} → ${num(nuovoPrimo.punti)}.`);
  }
  const scalati = dopo.filter((r, i) => posizionePrima.get(r.id) !== i + 1).length;
  console.log(`Posizioni che cambiano: ${scalati} su ${righe.length}.`);
}

console.log('');
if (adjustTot !== registrato) {
  console.log(`⚠️  ${num(Math.abs(adjustTot - registrato))} punti di saldo NON hanno una causa nel registro:`);
  console.log('    sono movimenti anteriori al registro stesso. Non si può sapere quanti venissero');
  console.log('    dalla slot, quindi i tagli qui sopra sono una STIMA PER DIFETTO.');
} else {
  console.log('Il registro spiega tutto il saldo: nessun punto senza causa, i conti sopra sono esatti.');
}
console.log('Questo script non ha scritto niente.');
console.log('');
