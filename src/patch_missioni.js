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
// Campi modificabili: title, description, repeatable, archived, section
const PATCHES = [
  { find: "Annanz' a Chies", description: 'Scatta una foto sulle scale della chiesa.' },
  { find: 'Ngopp o', title: (t) => t.replace(/Ngopp o'? Pont/i, "Ngopp o' Pont"),
    description: 'Scatta una foto con il paninaro di "ngopp o’ pont".' },
  { find: 'Man of the Match', repeatable: 1 },
  // Peppe Tap Tap non ha un orario: da missione fissa diventa flash, la
  // sblocca lo staff quando lo vede in giro. Le flash non stanno in nessuna
  // sezione, altrimenti il bonus "sezione completata" chiederebbe di
  // completare una missione che potrebbe non uscire mai.
  { find: 'Tap Tap', archived: 1, section: null,
    description: 'Flash! Scatta un selfie con Peppe Tap Tap.' },
];

// Missioni da aggiungere se non ci sono ancora (confronto sul nome, senza emoji)
// `flash: true` → nasce nascosta (archived), la sblocca lo staff al momento;
// le flash non stanno in nessuna sezione, come nel seed.
const NUOVE = [
  { name: 'Cecchino', desc: 'Scatta una foto con il pupazzo vinto sparando alle lattine.', rar: 'non-comune', sec: 'social' },
  { name: "Nu Gir Ngopp a Giostr", desc: 'Scatta una foto mentre fai un giro su una giostra presente alla festa.', rar: 'comune', sec: 'social' },
  { name: 'Vittoria', desc: 'Scatta una foto della colazione o dell’aperitivo al bar Vittoria.', rar: 'non-comune', sec: 'food' },
  { name: 'È sempre San Valentino da Romalba', desc: 'Scatta una foto del mazzo di fiori comprato da Romalba per il/la tuo/a partner.', rar: 'rara', sec: 'paese' },
  { name: 'Flash Mob', desc: 'Flash! Scatta una foto mentre partecipi al flash mob.', rar: 'rara', flash: true },
  // Vale il 13, 14, 15 e 17 ma non il 16: la finestra fa da recinto esterno,
  // `giorni` ne ritaglia il buco (vedi giorni_attivi in db.js).
  { name: 'Sticker Limited Edition',
    desc: 'Fai una foto al drink con l’adesivo del FantaSanRocco (se sei riuscito a prenderlo).',
    rar: 'non-comune',
    da: '2026-08-13 00:00:00', a: '2026-08-17 23:59:59', giorni: '13,14,15,17' },
];

let added = 0;
for (const n of NUOVE) {
  const esiste = db.prepare('SELECT id FROM missions WHERE title LIKE ?').get(`%${n.name}%`);
  if (esiste) { console.log(`= c'è già: ${n.name} (#${esiste.id})`); continue; }
  const info = db.prepare(`INSERT INTO missions
    (title, description, points, requires_photo, repeatable, archived, section, active_from, active_to, giorni_attivi)
    VALUES (?, ?, ?, 1, 0, ?, ?, ?, ?, ?)`)
    .run(`${EMOJI[n.rar]} ${n.name}`, n.desc, PTS[n.rar], n.flash ? 1 : 0, n.sec || null,
      n.da || null, n.a || null, n.giorni || null);
  const dove = n.flash ? 'FLASH (nascosta)'
    : n.giorni ? `solo i giorni ${n.giorni}`
    : `sezione ${n.sec}`;
  console.log(`＋ #${info.lastInsertRowid} "${EMOJI[n.rar]} ${n.name}" · ${PTS[n.rar]}pt · ${dove}`);
  added++;
}

let changed = 0;
for (const p of PATCHES) {
  const rows = db.prepare('SELECT id, title, description, repeatable, archived, section FROM missions WHERE title LIKE ?').all(`%${p.find}%`);
  if (!rows.length) { console.log(`⚠️  nessuna missione trovata per "${p.find}"`); continue; }
  for (const r of rows) {
    const title = typeof p.title === 'function' ? p.title(r.title) : (p.title || r.title);
    const description = p.description || r.description;
    // `section: null` è una modifica voluta (togli dalla sezione), non un
    // "campo assente": va distinta con hasOwnProperty, altrimenti `|| r.section`
    // la rimetterebbe dov'era.
    const repeatable = p.repeatable === undefined ? r.repeatable : p.repeatable;
    const archived = p.archived === undefined ? r.archived : p.archived;
    const section = Object.prototype.hasOwnProperty.call(p, 'section') ? p.section : r.section;
    if (title === r.title && description === r.description && repeatable === r.repeatable
        && archived === r.archived && section === r.section) {
      console.log(`= già a posto: ${r.title}`); continue;
    }
    db.prepare('UPDATE missions SET title = ?, description = ?, repeatable = ?, archived = ?, section = ? WHERE id = ?')
      .run(title, description, repeatable, archived, section, r.id);
    const note = [
      repeatable !== r.repeatable ? (repeatable ? 'ora RIPETIBILE' : 'non più ripetibile') : null,
      archived !== r.archived ? (archived ? 'ora FLASH (nascosta)' : 'ora visibile') : null,
      section !== r.section ? (section ? `sezione ${section}` : 'tolta dalla sezione') : null,
    ].filter(Boolean).join(' · ');
    console.log(`✔ #${r.id} "${title}"${note ? ' · ' + note : ''}`);
    changed++;
  }
}
console.log(`Fatto: ${changed} missioni aggiornate, ${added} aggiunte.`);
const bySec = db.prepare("SELECT section, COUNT(*) c FROM missions WHERE section IS NOT NULL AND archived = 0 GROUP BY section").all();
console.log('Sezioni ora:', bySec.map((r) => `${r.section}=${r.c}`).join(' · '));
