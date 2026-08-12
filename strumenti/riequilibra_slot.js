// ===================================================================
// FantaSanRocco — Riequilibrio della slot: i suoi punti valgono un decimo
// -------------------------------------------------------------------
// Il 12 agosto la classifica era decisa dalla slot: su 81 giocatori 71
// avevano perso e 10 vinto, e i primi due posti erano fatti per il 70%
// di vincite alla slot. Questo script applica la correzione decisa: i
// punti della slot contano il 10%, sia in guadagno sia in perdita.
//
// Uso (in produzione, dentro il container):
//   cd /app && node strumenti/riequilibra_slot.js --prova     ← non scrive
//   cd /app && node strumenti/riequilibra_slot.js --applica
//
// Senza --applica non scrive NIENTE: è la modalità normale, perché una
// modifica che tocca il punteggio di centinaia di persone va guardata
// prima.
//
// COME FUNZIONA. Non riscrive la storia: le giocate restano nel registro
// esattamente come sono avvenute. Aggiunge a ciascuno UNA riga di
// compensazione con causa `riequilibrio`, pari al 90% del suo netto slot
// cambiato di segno. Chi ha perso la vede in positivo, chi ha vinto in
// negativo. Così ognuno, aprendo il proprio storico, trova scritto cosa
// gli è successo e quando, invece di ritrovarsi un numero diverso senza
// spiegazione.
//
// SI PUÒ LANCIARE UNA VOLTA SOLA. Chi ha già la riga di riequilibrio
// viene saltato: lanciarlo due volte, senza questo controllo, taglierebbe
// due volte gli stessi punti.
//
// NESSUNO VA SOTTO ZERO, ed è dimostrabile: il saldo di ognuno è
// (altro + nettoSlot) e diventa (altro + nettoSlot/10). Se il netto slot
// è negativo il saldo SALE; se è positivo resta positivo perché `altro`
// non è mai negativo. Lo script lo verifica comunque prima di scrivere.
// ===================================================================
const { db } = require('../src/db');
const punti = require('../src/lib/punti');

const PESO = 0.1;
const APPLICA = process.argv.includes('--applica');

const num = (v) => Math.round(v).toLocaleString('it-IT');

// Chi ha già ricevuto la correzione: si salta, altrimenti lo si taglia due volte.
const giaFatti = new Set(
  db.prepare("SELECT DISTINCT user_id FROM punti_movimenti WHERE causa = 'riequilibrio'")
    .all().map((r) => r.user_id)
);

const netti = db.prepare(`
  SELECT p.user_id, u.nickname, SUM(p.delta) AS netto, COUNT(*) AS giocate
  FROM punti_movimenti p JOIN users u ON u.id = p.user_id
  WHERE p.causa = 'slot'
  GROUP BY p.user_id
`).all();

const daFare = [];
for (const r of netti) {
  if (giaFatti.has(r.user_id)) continue;
  // Quanto togliere (o restituire) perché resti in piedi solo il 10%.
  const correzione = Math.round(r.netto * PESO) - r.netto;
  if (correzione === 0) continue;
  daFare.push({ ...r, correzione });
}

console.log('');
console.log(`Hanno giocato alla slot: ${netti.length}`);
if (giaFatti.size) console.log(`Già riequilibrati in un lancio precedente: ${giaFatti.size} (saltati)`);
console.log(`Da riequilibrare adesso: ${daFare.length}`);

const scendono = daFare.filter((r) => r.correzione < 0);
const salgono = daFare.filter((r) => r.correzione > 0);
console.log(`   perdono punti: ${scendono.length} (${num(scendono.reduce((a, r) => a + r.correzione, 0))})`);
console.log(`   ne riprendono: ${salgono.length} (+${num(salgono.reduce((a, r) => a + r.correzione, 0))})`);

// Controllo di sicurezza: nessun saldo deve poter finire sotto zero.
const saldi = new Map(db.prepare("SELECT id, points_adjust FROM users").all().map((u) => [u.id, u.points_adjust]));
const rischio = daFare.filter((r) => (saldi.get(r.user_id) || 0) + r.correzione < 0);
if (rischio.length) {
  console.log('');
  console.log(`⛔ ${rischio.length} giocatori andrebbero sotto zero. NON procedo.`);
  for (const r of rischio.slice(0, 10)) {
    console.log(`   ${r.nickname}: saldo ${num(saldi.get(r.user_id))} ${r.correzione > 0 ? '+' : ''}${num(r.correzione)}`);
  }
  process.exit(1);
}

console.log('');
console.log('I venti movimenti più grossi:');
console.log('giocatore              netto slot   →  conta   correzione');
console.log('─'.repeat(58));
for (const r of [...daFare].sort((a, b) => Math.abs(b.correzione) - Math.abs(a.correzione)).slice(0, 20)) {
  console.log(
    (r.nickname || '?').slice(0, 20).padEnd(22),
    num(r.netto).padStart(9),
    '  →',
    num(Math.round(r.netto * PESO)).padStart(7),
    (r.correzione > 0 ? '+' + num(r.correzione) : num(r.correzione)).padStart(12)
  );
}

if (!APPLICA) {
  console.log('');
  console.log('PROVA — non ho scritto niente. Per applicare davvero:');
  console.log('   node strumenti/riequilibra_slot.js --applica');
  console.log('');
  process.exit(0);
}

// Tutto in una transazione: o si riequilibrano tutti o nessuno. A metà
// strada la classifica sarebbe un ibrido senza senso.
const quando = new Date().toISOString().slice(0, 16).replace('T', ' ');
db.transaction(() => {
  for (const r of daFare) {
    punti.muovi(r.user_id, r.correzione, 'riequilibrio',
      `La slot vale il 10%: netto ${r.netto > 0 ? '+' : ''}${r.netto} in ${r.giocate} giocate → ${Math.round(r.netto * PESO)}`);
  }
})();

console.log('');
console.log(`✔ Riequilibrati ${daFare.length} giocatori (${quando}).`);
console.log('  Ognuno trova la riga "Riequilibrio slot" nel proprio storico punti.');
console.log('');
