// ===================================================================
// FantaSanRocco — Ritocchi alle missioni già in produzione
// -------------------------------------------------------------------
// Al contrario del seed, questo script NON cancella nulla: corregge le
// missioni indicate e ne aggiunge di nuove se mancano. È idempotente:
// rilanciarlo non fa danni e non crea doppioni.
//
// Uso (in produzione, dentro il container):
//   cd /app && node src/patch_missioni.js
// ===================================================================
const { db } = require('./db');

const PTS = { comune: 25, 'non-comune': 50, rara: 100, epica: 250, leggendaria: 500 };
const EMOJI = { comune: '⚪', 'non-comune': '🟢', rara: '🔵', epica: '🟣', leggendaria: '🟠' };

// find = pezzo di titolo da cercare (senza l'emoji della rarità)
// Campi modificabili: title, description, repeatable (0/1)
const PATCHES = [
  { find: "Annanz' a Chies", description: 'Scatta una foto sulle scale della chiesa.' },
  { find: 'Ngopp o', title: (t) => t.replace(/Ngopp o'? Pont/i, "Ngopp o' Pont"),
    description: 'Scatta una foto con il paninaro di "ngopp o’ pont".' },
  { find: 'Man of the Match', repeatable: 1 },
];

// Missioni da aggiungere se non ci sono ancora (confronto sul nome, senza emoji)
const NUOVE = [
  { name: 'Cecchino', desc: 'Scatta una foto con il pupazzo vinto sparando alle lattine.', rar: 'non-comune', sec: 'social' },
  { name: "Nu Gir Ngopp a Giostr", desc: 'Scatta una foto mentre fai un giro su una giostra presente alla festa.', rar: 'comune', sec: 'social' },
];

let added = 0;
for (const n of NUOVE) {
  const esiste = db.prepare('SELECT id FROM missions WHERE title LIKE ?').get(`%${n.name}%`);
  if (esiste) { console.log(`= c'è già: ${n.name} (#${esiste.id})`); continue; }
  const info = db.prepare(`INSERT INTO missions
    (title, description, points, requires_photo, repeatable, archived, section)
    VALUES (?, ?, ?, 1, 0, 0, ?)`).run(`${EMOJI[n.rar]} ${n.name}`, n.desc, PTS[n.rar], n.sec);
  console.log(`＋ #${info.lastInsertRowid} "${EMOJI[n.rar]} ${n.name}" · ${PTS[n.rar]}pt · sezione ${n.sec}`);
  added++;
}

let changed = 0;
for (const p of PATCHES) {
  const rows = db.prepare('SELECT id, title, description, repeatable FROM missions WHERE title LIKE ?').all(`%${p.find}%`);
  if (!rows.length) { console.log(`⚠️  nessuna missione trovata per "${p.find}"`); continue; }
  for (const r of rows) {
    const title = typeof p.title === 'function' ? p.title(r.title) : (p.title || r.title);
    const description = p.description || r.description;
    const repeatable = p.repeatable === undefined ? r.repeatable : p.repeatable;
    if (title === r.title && description === r.description && repeatable === r.repeatable) {
      console.log(`= già a posto: ${r.title}`); continue;
    }
    db.prepare('UPDATE missions SET title = ?, description = ?, repeatable = ? WHERE id = ?')
      .run(title, description, repeatable, r.id);
    const note = repeatable !== r.repeatable ? (repeatable ? ' · ora RIPETIBILE' : ' · non più ripetibile') : '';
    console.log(`✔ #${r.id} "${title}" · ${description}${note}`);
    changed++;
  }
}
console.log(`Fatto: ${changed} missioni aggiornate, ${added} aggiunte.`);
const bySec = db.prepare("SELECT section, COUNT(*) c FROM missions WHERE section IS NOT NULL AND archived = 0 GROUP BY section").all();
console.log('Sezioni ora:', bySec.map((r) => `${r.section}=${r.c}`).join(' · '));
