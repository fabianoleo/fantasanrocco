// ===================================================================
// FantaSanRocco — Correzioni testi missioni (patch #1)
// -------------------------------------------------------------------
// Al contrario del seed, questo script NON cancella nulla: aggiorna
// solo titolo/descrizione delle missioni indicate. È idempotente,
// rilanciarlo non fa danni.
//
// Uso (in produzione, dentro il container):
//   cd /app && node src/patch_missioni.js
// ===================================================================
const { db } = require('./db');

// find = pezzo di titolo da cercare (senza l'emoji della rarità)
// Campi modificabili: title, description, repeatable (0/1)
const PATCHES = [
  { find: "Annanz' a Chies", description: 'Scatta una foto sulle scale della chiesa.' },
  { find: 'Ngopp o', title: (t) => t.replace(/Ngopp o'? Pont/i, "Ngopp o' Pont"),
    description: 'Scatta una foto con il paninaro di "ngopp o’ pont".' },
  { find: 'Man of the Match', repeatable: 1 },
];

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
console.log(`Fatto: ${changed} missioni aggiornate.`);
