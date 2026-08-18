// ===================================================================
// FantaSanRocco — Ritira fuori da un backup una missione cancellata
// -------------------------------------------------------------------
// COSA È SUCCESSO, che è il motivo per cui questo file esiste.
// Nel database le prove sono legate alla missione con ON DELETE CASCADE:
//
//   mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE
//
// Cancellare una missione dal pannello non toglie solo la missione: porta
// con sé TUTTE le prove che la gente aveva mandato per quella missione. E
// siccome i punti in classifica non sono un numero salvato da qualche parte
// ma la somma delle prove approvate, sparite le prove spariscono i punti.
// Qualcuno si è visto scendere di migliaia di punti nella notte senza aver
// fatto niente.
//
// COSA FA QUESTO STRUMENTO
// Va a prendere in un backup la missione e le sue prove, e le rimette nel
// database vivo. La missione torna ARCHIVIATA: chi l'aveva cancellata la
// voleva fuori dall'elenco, e archiviata non si vede — ma i punti tornano,
// perché la classifica somma le prove approvate senza guardare se la
// missione è archiviata.
//
// Gli id vengono rimessi identici a prima. Le tabelle sono AUTOINCREMENT,
// quindi un id cancellato non viene mai riassegnato a qualcun altro: non
// c'è il rischio di sovrascrivere la prova di un'altra persona.
//
//   node strumenti/recupera_missione.js
//       elenca i backup disponibili e le cancellazioni fatte dal pannello
//
//   node strumenti/recupera_missione.js --da backup-....db --nome Spia
//       dice cosa tornerebbe indietro, senza scrivere niente
//
//   node strumenti/recupera_missione.js --da backup-....db --nome Spia --scrivi
//       lo fa per davvero
//
// LE FOTO NON SERVE RECUPERARLE: la cascata ha cancellato le righe nel
// database, non i file su disco. Rimesse le righe, le foto tornano visibili.
// ===================================================================
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { db, BACKUPS_DIR } = require('../src/db');

const arg = (nome) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : null;
};
const DA     = arg('--da');
const NOME   = arg('--nome');
const SCRIVI = process.argv.includes('--scrivi');

const nudo = (t) => String(t || '').replace(/^[^\p{L}\p{N}"'«(]+/u, '').trim();

// ── Senza argomenti: si guarda in giro e basta ──────────────────────
if (!DA || !NOME) {
  const file = fs.existsSync(BACKUPS_DIR)
    ? fs.readdirSync(BACKUPS_DIR).filter((f) => f.endsWith('.db'))
        .map((f) => ({ f, t: fs.statSync(path.join(BACKUPS_DIR, f)).mtime }))
        .sort((a, b) => b.t - a.t)
    : [];
  console.log(`BACKUP DISPONIBILI (${file.length}) — in ${BACKUPS_DIR}`);
  file.slice(0, 30).forEach(({ f, t }) => console.log(`  ${t.toISOString().slice(0, 16).replace('T', ' ')}  ${f}`));

  console.log('\nMISSIONI CANCELLATE DAL PANNELLO (dal registro)');
  const canc = db.prepare(
    "SELECT created_at, nickname, details FROM audit_log WHERE action = 'missione.elimina' ORDER BY created_at DESC LIMIT 20"
  ).all();
  if (!canc.length) console.log('  nessuna');
  canc.forEach((r) => console.log(`  ${r.created_at}  ${r.nickname}  ${r.details}`));
  console.log('\nGli orari del registro sono UTC: in Italia sono due ore più tardi.');
  console.log('Scegli un backup PRECEDENTE alla cancellazione e rilancia con --da e --nome.');
  process.exit(0);
}

// ── Con --da e --nome: si guarda dentro il backup ───────────────────
const percorso = path.isAbsolute(DA) ? DA : path.join(BACKUPS_DIR, DA);
if (!fs.existsSync(percorso)) {
  console.error(`Non trovo il backup: ${percorso}`);
  process.exit(1);
}
const vecchio = new Database(percorso, { readonly: true });

const missione = vecchio.prepare('SELECT * FROM missions').all()
  .find((r) => nudo(r.title).toLowerCase() === NOME.toLowerCase().trim());
if (!missione) {
  console.error(`Dentro quel backup non c'è nessuna missione che si chiama "${NOME}".`);
  process.exit(1);
}

const prove = vecchio.prepare('SELECT * FROM submissions WHERE mission_id = ?').all(missione.id);
const approvate = prove.filter((p) => p.status === 'approved');

console.log(`MISSIONE: ${missione.title}  ·  ${missione.points} punti  ·  id #${missione.id}`);
console.log(`  prove nel backup: ${prove.length}  (approvate: ${approvate.length})`);

// Chi riprende punti, e quanti. Le prove di utenti che non esistono più si
// saltano: reinserirle darebbe errore sulla chiave esterna e comunque non
// servirebbero a nessuno.
const vivo = new Set(db.prepare("SELECT id FROM users").all().map((r) => r.id));
const perUtente = new Map();
for (const p of approvate) {
  if (!vivo.has(p.user_id)) continue;
  perUtente.set(p.user_id, (perUtente.get(p.user_id) || 0) + missione.points);
}
console.log(`\nCHI RIPRENDE I PUNTI (${perUtente.size} persone, ${[...perUtente.values()].reduce((a, b) => a + b, 0)} punti in tutto)`);
for (const [uid, pt] of [...perUtente].sort((a, b) => b[1] - a[1])) {
  const u = db.prepare('SELECT nickname FROM users WHERE id = ?').get(uid);
  console.log(`  +${String(pt).padStart(4)}  ${u ? u.nickname : '#' + uid}`);
}

// Cosa c'è già nel database vivo: si rimette solo quello che manca davvero,
// così rilanciarlo due volte non raddoppia niente.
const cePeGia = db.prepare('SELECT id FROM missions WHERE id = ?').get(missione.id);
const proveGia = new Set(db.prepare('SELECT id FROM submissions WHERE mission_id = ?').all(missione.id).map((r) => r.id));
const daRimettere = prove.filter((p) => vivo.has(p.user_id) && !proveGia.has(p.id));

console.log(`\nDA RIMETTERE: ${cePeGia ? 'la missione c\'è già' : 'la missione'} · ${daRimettere.length} prove`);
if (!SCRIVI) {
  console.log('\n(PROVA: non ho scritto niente. Rilancia con --scrivi per farlo davvero.)');
  process.exit(0);
}

// Si copiano solo le colonne che esistono in ENTRAMBI gli schemi: se il
// backup è di una versione più vecchia gli manca qualche colonna, e insistere
// farebbe fallire tutto invece di recuperare quello che si può.
const comuni = (tabella, riga) => {
  const qui = new Set(db.prepare(`PRAGMA table_info(${tabella})`).all().map((c) => c.name));
  return Object.keys(riga).filter((c) => qui.has(c));
};

const lavoro = db.transaction(() => {
  if (!cePeGia) {
    const col = comuni('missions', missione);
    // ARCHIVIATA: era stata cancellata apposta, non deve tornare in elenco.
    const vals = col.map((c) => (c === 'archived' ? 1 : missione[c]));
    db.prepare(`INSERT INTO missions (${col.join(', ')}) VALUES (${col.map(() => '?').join(', ')})`).run(...vals);
    console.log(`↺ missione #${missione.id} "${missione.title}" rimessa, ARCHIVIATA`);
  }
  let n = 0;
  for (const p of daRimettere) {
    const col = comuni('submissions', p);
    db.prepare(`INSERT INTO submissions (${col.join(', ')}) VALUES (${col.map(() => '?').join(', ')})`)
      .run(...col.map((c) => p[c]));
    n++;
  }
  console.log(`↺ ${n} prove rimesse`);
});
lavoro();

console.log('\nFatto. Controlla la classifica: i punti sono tornati.');
console.log('La missione resta archiviata, quindi in elenco non si vede.');
