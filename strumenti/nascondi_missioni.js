// ===================================================================
// FantaSanRocco — Nasconde (e rimette) un blocco di missioni
// -------------------------------------------------------------------
// Il 15 e il 16 agosto l'elenco era diventato illeggibile: trentaquattro
// missioni vanno tolte dalla vista per quei due giorni e rimesse il 17.
//
//   node strumenti/nascondi_missioni.js            le nasconde
//   node strumenti/nascondi_missioni.js --mostra   le rimette com'erano
//   node strumenti/nascondi_missioni.js --prova    dice cosa farebbe
//
// PERCHÉ NON BASTA ARCHIVIARLE E BASTA
// «Nascosta» nel database è una bandierina sola (archived), la stessa che
// usano le flash. Se il 17 rimettessimo a mano tutto quello che è nascosto,
// tireremmo fuori anche le flash — che devono restare nascoste finché non le
// sblocca lo staff. Per questo qui si SEGNA quali sono state nascoste da
// questo script, e il ripristino tocca soltanto quelle.
//
// IL BONUS DI SEZIONE
// Nascondere una missione la toglie dal conteggio della sua sezione: Sport
// passa da 13 tappe a 6, Paese da 22 a 8. Per questo il bonus di sezione è
// sospeso il 15 e il 16 (vedi SEZIONI_SOSPESE in server.js). Quando si
// rimettono, questo script lascia un biglietto e il RECUPERO lo fa il server
// al primo riavvio: assegna i bonus a chi nel frattempo li aveva maturati
// davvero. Senza, chi ha completato una sezione in quei due giorni non li
// vedrebbe mai.
// ===================================================================
const { db } = require('../src/db');

const MOSTRA = process.argv.includes('--mostra');
const PROVA  = process.argv.includes('--prova');
const CHIAVE = 'missioni_nascoste_15_16';

// I nomi come stanno nell'elenco, senza l'emoji della rarità.
const DA_NASCONDERE = [
  'Primo Cittadino', 'A Per', 'Tradizione', 'Ritorna al Passato',
  'In Vespa', 'Tre Ruote', 'Cantiere', "E' Tiemp Bell...",
  "Ngopp a' Cappell", 'Benvenuti a Siano', 'Colazione dei Campioni',
  'Il Pacco', 'Piazza deserta', 'Fuori Orario', 'Quattro Frecce',
  'Lo Zio di Siano', "O' Mast", 'Fila Infinita', 'Leccucci',
  'Mangiata', 'Gemelli diversi', 'Tamberi', 'Trash Royale',
  'Glitch', 'Rocco', "Miettc a' Man Toji", 'Kiss Kiss', 'Corri Forrest',
  'Partitella', 'Ultras', 'Nu Lumin a Sant Rocc', 'Man of the Match',
  'Sempre Pronti', 'Green days', 'Calici in Alto', 'Nu Gir Ngopp a Giostr',
];

const nudo = (t) => String(t || '').replace(/^[^\p{L}\p{N}"'«(]+/u, '').trim();

function leggiSegnate() {
  const r = db.prepare('SELECT valore FROM impostazioni WHERE chiave = ?').get(CHIAVE);
  if (!r) return [];
  try { return JSON.parse(r.valore) || []; } catch { return []; }
}

// ── RIMETTERLE ──────────────────────────────────────────────────────
if (MOSTRA) {
  const ids = leggiSegnate();
  if (!ids.length) {
    console.log('Non risulta nascosta nessuna missione da questo script.');
    process.exit(0);
  }
  let rimesse = 0;
  for (const id of ids) {
    const m = db.prepare('SELECT id, title, archived FROM missions WHERE id = ?').get(id);
    if (!m) { console.log(`= #${id} non esiste più`); continue; }
    if (m.archived !== 1) { console.log(`= già visibile: ${m.title}`); continue; }
    if (!PROVA) db.prepare('UPDATE missions SET archived = 0 WHERE id = ?').run(id);
    console.log(`↑ ${m.title}`);
    rimesse++;
  }
  if (!PROVA) db.prepare('DELETE FROM impostazioni WHERE chiave = ?').run(CHIAVE);
  console.log(`\n${PROVA ? 'PROVA: ' : ''}${rimesse} missioni rimesse in elenco.`);

  // Recupero dei bonus di sezione sospesi il 15 e il 16: ora che le sezioni
  // sono di nuovo intere, chi le ha completate davvero deve incassare. Il
  // giro lo fa il server al prossimo avvio — l'assegnazione manda anche le
  // notifiche, e quella roba sta nel server, non qui.
  if (!PROVA) {
    db.prepare(`INSERT INTO impostazioni (chiave, valore) VALUES ('recupero_bonus_sezione', 'da fare')
                ON CONFLICT(chiave) DO UPDATE SET valore = 'da fare'`).run();
    console.log('\n⚠️  ORA RIAVVIA L\'APP da Dokploy.');
    console.log('   Al riavvio il server assegna i bonus di sezione sospesi il 15 e il 16');
    console.log('   a chi li aveva maturati davvero. Senza riavvio quel giro non parte.');
  }
  process.exit(0);
}

// ── NASCONDERLE ─────────────────────────────────────────────────────
// Rilanciarlo non è un errore: è il modo di RIMETTERE IN PAUSA quelle che
// nel frattempo qualcosa ha riaperto. Prima si rifiutava di ripartire, e
// quando patch_missioni le ha sbloccate tutte non c'era modo di richiuderle
// se non a mano, una per una.
const giaSegnate = leggiSegnate();
if (giaSegnate.length) {
  console.log(`Risultano già in pausa ${giaSegnate.length} missioni: controllo che siano ancora nascoste.\n`);
}

const ids = [];
let mancanti = 0;
for (const nome of DA_NASCONDERE) {
  const righe = db.prepare('SELECT id, title, archived FROM missions WHERE game_key IS NULL').all()
    .filter((r) => nudo(r.title) === nome);
  if (!righe.length) { console.log(`✗ NON TROVATA: ${nome}`); mancanti++; continue; }
  for (const r of righe) {
    if (r.archived === 1) { console.log(`= già nascosta: ${r.title}`); continue; }
    if (!PROVA) db.prepare('UPDATE missions SET archived = 1 WHERE id = ?').run(r.id);
    ids.push(r.id);
    console.log(`↓ ${r.title}`);
  }
}
const tutti = [...new Set([...giaSegnate, ...ids])];
if (!PROVA && tutti.length) {
  db.prepare(`INSERT INTO impostazioni (chiave, valore) VALUES (?, ?)
              ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore`)
    .run(CHIAVE, JSON.stringify(tutti));
}
console.log(`\n${PROVA ? 'PROVA: ' : ''}${ids.length} missioni nascoste ora`
  + (giaSegnate.length ? `, ${tutti.length} in pausa in tutto` : '')
  + (mancanti ? `, ${mancanti} NON trovate (guarda sopra)` : '') + '.');

const sez = db.prepare(`SELECT section s, COUNT(*) n FROM missions
                        WHERE section IS NOT NULL AND archived = 0 GROUP BY s ORDER BY s`).all();
console.log('Sezioni ora (solo le visibili): ' + sez.map((r) => `${r.s}=${r.n}`).join(' · '));
console.log('Il bonus di sezione è sospeso il 15 e il 16: vedi SEZIONI_SOSPESE in server.js.');
