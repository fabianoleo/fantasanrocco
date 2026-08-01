// ===================================================================
// FantaSanRocco — Ritocchi alle missioni già in produzione
// -------------------------------------------------------------------
// Al contrario del seed, questo script NON cancella nulla: corregge le
// missioni indicate e ne aggiunge di nuove se mancano. È idempotente:
// rilanciarlo non fa danni e non crea doppioni.
//
// Uso (in produzione, dentro il container):
//   cd /app && node strumenti/patch_missioni.js
// ===================================================================
const { db } = require('../src/db');

const PTS = { comune: 25, 'non-comune': 50, rara: 100, epica: 250, leggendaria: 500 };
const EMOJI = { comune: '⚪', 'non-comune': '🟢', rara: '🔵', epica: '🟣', leggendaria: '🟠' };

// Finestra di un singolo giorno di festa, come nel seed: le sfide giornaliere
// si vedono solo nel loro giorno (ora italiana, il server legge Europe/Rome).
const GIORNO = (n) => [`2026-08-${n} 00:00:00`, `2026-08-${n} 23:59:59`];

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
  // ── Giro del 30 luglio 2026 ──────────────────────────────────────
  // I membri del team sono più di uno: la missione va ripetuta per ognuno,
  // come già si fa con Man of the Match e i calciatori.
  { find: 'Meet the Team', repeatable: 1 },
  // Rete di sicurezza: la riga su "Annanz' a Chies" corregge già la panchina,
  // ma cerca per titolo. Questa cerca anche nel TESTO (inDesc), così prende il
  // caso in cui la panchina stia scritta in una missione con un altro nome.
  { find: 'panchina', inDesc: true, description: 'Scatta una foto sulle scale della chiesa.' },
  // Nel primo giro la missione era stata aperta dal 16 al 18 perché non si
  // sapeva quando montassero: se un lancio precedente l'ha già creata così,
  // questa riga le rimette il solo 18.
  { find: 'Tutto Pronto per il Palio', da: GIORNO(18)[0], a: GIORNO(18)[1] },
  // Le foto CON una persona che nella processione ha un ruolo: in quel
  // momento stanno lavorando, fermarli per una foto è fuori luogo. Le
  // missioni che si fanno APPOSTA durante la processione (Il Portatore, In
  // Cammino, Momento Solenne) restano ovviamente come sono.
  { find: 'Primo Cittadino', description: 'Scatta una foto con il Sindaco di Siano. Non durante la processione.' },
  { find: 'Benedizione', description: 'Scatta una foto con il parroco. Non durante la processione.' },
  { find: 'Musica Maestro', description: 'Scatta un selfie con la banda musicale. Non durante la processione, mentre stanno suonando.' },
  // ── Giro del 1º agosto 2026 ──────────────────────────────────────
  // Le otto nuove erano nate senza sezione, quindi finivano fra le sfide
  // speciali. Ora stanno nelle quattro sezioni, divise per tema. Queste righe
  // servono se un lancio precedente le ha già create: il blocco NUOVE salta
  // le missioni che esistono, e da solo non le sposterebbe mai.
  { find: 'BE REAL', section: 'sport' },
  { find: 'I love me', section: 'paese' },
  { find: 'Moltiplicatore di Rocchi', section: 'social' },
  { find: 'Gemelli diversi', section: 'social' },
  { find: 'Piazza deserta', section: 'paese' },
  { find: 'Spesa folle', section: 'food' },
  { find: 'Corri Forrest', section: 'sport' },
  { find: 'Green days', section: 'sport' },
];

// Missioni da eliminare del tutto (non archiviare: archived=1 vuol dire
// "flash nascosta", quindi resterebbe sbloccabile per sbaglio).
// Se qualcuno l'ha già completata NON si cancella: perderebbe i punti a
// classifica in corso. In quel caso la si nasconde e lo script lo dice.
const RIMOZIONI = [
  { find: "A' Ciort", perche: 'la lotteria di San Rocco non si fa più' },
  // Attenzione a non confonderla con "Sticker Limited Edition", che è
  // l'adesivo sul drink e resta: questa era il bollino col logo.
  { find: 'Bollino', perche: 'missione tolta dall\'elenco' },
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

  // ── Giro del 30 luglio 2026 ──────────────────────────────────────
  // Una missione per ogni artista in programmazione. Mazzariello (14) e
  // Napoliitudine (15) ce l'hanno già dal seed: qui ci sono solo i mancanti,
  // ognuno legato alla SUA serata, così non si può fotografare un cantante
  // il giorno in cui non c'è.
  { name: 'Groove Motion', desc: 'Scatta una foto con un membro della Groove Motion Live Band.',
    rar: 'rara', da: GIORNO(14)[0], a: GIORNO(14)[1] },
  { name: 'Alfo & Mike', desc: 'Scatta una foto con Alfo V. o con Mike Carotenuto in consolle.',
    rar: 'rara', da: GIORNO(16)[0], a: GIORNO(16)[1] },
  { name: 'LDA & Aka 7even', desc: 'Scatta una foto con LDA o con Aka 7even.',
    rar: 'epica', da: GIORNO(17)[0], a: GIORNO(17)[1] },
  { name: 'Disco Inferno', desc: 'Scatta una foto con uno dei Disco Inferno.',
    rar: 'rara', da: GIORNO(17)[0], a: GIORNO(17)[1] },
  { name: 'Vagaband', desc: 'Scatta una foto con un membro della Vagaband.',
    rar: 'rara', da: GIORNO(18)[0], a: GIORNO(18)[1] },

  // Prende in 'sport' il posto lasciato libero dalla lotteria: così il conto
  // della sezione non cambia e il bonus "sezione completata" resta alla
  // stessa difficoltà di prima.
  { name: 'Nu Lumin a San Rocc', desc: 'Accendi un lumino in chiesa lasciando un’offerta e scatta una foto.',
    rar: 'non-comune', sec: 'sport' },

  // Sera dei fuochi
  { name: 'Musicante', desc: 'Scatta una foto mentre suoni uno strumento la sera dei fuochi.',
    rar: 'rara', da: GIORNO(18)[0], a: GIORNO(18)[1] },
  { name: 'Campanile sotto i Fuochi',
    desc: 'Scatta una foto del campanile mentre è illuminato dai fuochi d’artificio.',
    rar: 'epica', da: GIORNO(18)[0], a: GIORNO(18)[1] },

  // Le batterie sulla provinciale verso Bracigliano le montano la mattina del
  // 18, quindi la missione vale solo quel giorno: aprirla prima significava
  // tenerla in elenco quando non c'è ancora niente da fotografare.
  { name: 'Tutto Pronto per il Palio',
    desc: 'Scatta una foto mentre preparano i fuochi d’artificio sulla strada provinciale verso Bracigliano.',
    rar: 'epica', da: GIORNO(18)[0], a: GIORNO(18)[1] },

  // ── Giro del 31 luglio 2026 ──────────────────────────────────────
  // Epica come Pigiama Party: il costume ad agosto te lo devi procurare, e qui
  // in più c'è da offrire da bere. La foto deve mostrare tutte e due le cose,
  // altrimenti resta un travestimento e basta.
  // Entra in 'social' e non fra le sfide speciali: è una missione fissa, si
  // può fare in un giorno qualunque della festa. Attenzione che così la
  // sezione passa da 15 a 16 tappe, quindi il bonus «sezione completata»
  // chiede una missione in più di prima.
  { name: 'Missione Gnak',
    desc: 'Vestiti da Babbo Natale, offri un drink a qualcuno e scatta una foto del brindisi.',
    rar: 'epica', sec: 'social' },

  // ── Giro del 1º agosto 2026 ──────────────────────────────────────
  // Divise fra le quattro sezioni, per tema. Attenzione: ogni missione in più
  // in una sezione alza di uno il conto delle tappe, e quindi il bonus
  // «sezione completata» chiede una missione in più di prima.
  // Due portano il marchio di chi le mette (vedi la colonna `sponsor`): il
  // logo compare sulla card della missione.
  { name: 'BE REAL (Sianese)',
    desc: 'Fai una foto con il dirigente della Real Sianese Michele Lamberti.',
    rar: 'non-comune', sec: 'sport', sponsor: 'realsianese.png' },
  { name: 'Ps. : I love me',
    desc: 'Fai una foto mentre compri dei fiori per te stessa/o da Vastola.',
    rar: 'rara', sec: 'paese', sponsor: 'vastola.png' },
  // Il bonus dei +10 punti lo aggiunge lo staff in moderazione: qui si dice
  // solo che c'è, perché è la descrizione a fare la promessa.
  { name: 'Moltiplicatore di Rocchi',
    desc: 'Fai una foto con almeno 7 persone di nome "Rocco" (+10 punti bonus se c’è un cane).',
    rar: 'leggendaria', sec: 'social' },
  { name: 'Gemelli diversi',
    desc: 'Fai una foto con un tuo omonimo (che ha il tuo stesso nome e cognome).',
    rar: 'epica', sec: 'social' },
  { name: 'Piazza deserta',
    desc: 'Fai una foto della piazza principale del paese completamente vuota durante la settimana di festa.',
    rar: 'non-comune', sec: 'paese' },
  { name: 'Spesa folle',
    desc: 'Fai una foto mentre fai la spesa in abiti "folli" (elegante, in costume, maschera e boccaglio ecc.).',
    rar: 'epica', sec: 'food' },
  { name: 'Corri Forrest',
    desc: 'Fai una foto mentre pratichi attività fisica all’aperto.',
    rar: 'rara', sec: 'sport' },
  { name: 'Green days',
    desc: 'Fai una foto mentre ripulisci le strade (+10 punti bonus se pulisci con uno spazzino).',
    rar: 'comune', sec: 'sport' },
];

let added = 0;
for (const n of NUOVE) {
  const esiste = db.prepare('SELECT id FROM missions WHERE title LIKE ?').get(`%${n.name}%`);
  if (esiste) { console.log(`= c'è già: ${n.name} (#${esiste.id})`); continue; }
  const info = db.prepare(`INSERT INTO missions
    (title, description, points, requires_photo, repeatable, archived, section, active_from, active_to, giorni_attivi, sponsor)
    VALUES (?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?)`)
    .run(`${EMOJI[n.rar]} ${n.name}`, n.desc, PTS[n.rar], n.flash ? 1 : 0, n.sec || null,
      n.da || null, n.a || null, n.giorni || null, n.sponsor || null);
  const dove = n.flash ? 'FLASH (nascosta)'
    : n.giorni ? `solo i giorni ${n.giorni}`
    : n.da ? (n.da.slice(5, 10) === n.a.slice(5, 10)
        ? `solo il ${n.da.slice(8, 10)} agosto`
        : `dal ${n.da.slice(8, 10)} al ${n.a.slice(8, 10)} agosto`)
    : n.sec ? `sezione ${n.sec}`
    : 'sempre visibile';
  console.log(`＋ #${info.lastInsertRowid} "${EMOJI[n.rar]} ${n.name}" · ${PTS[n.rar]}pt · ${dove}`);
  added++;
}

let changed = 0;
for (const p of PATCHES) {
  const CAMPI = 'id, title, description, repeatable, archived, section, active_from, active_to';
  const rows = p.inDesc
    ? db.prepare(`SELECT ${CAMPI} FROM missions WHERE title LIKE ? OR description LIKE ?`).all(`%${p.find}%`, `%${p.find}%`)
    : db.prepare(`SELECT ${CAMPI} FROM missions WHERE title LIKE ?`).all(`%${p.find}%`);
  if (!rows.length) { console.log(`= niente da correggere per "${p.find}"`); continue; }
  for (const r of rows) {
    const title = typeof p.title === 'function' ? p.title(r.title) : (p.title || r.title);
    const description = p.description || r.description;
    // `section: null` è una modifica voluta (togli dalla sezione), non un
    // "campo assente": va distinta con hasOwnProperty, altrimenti `|| r.section`
    // la rimetterebbe dov'era.
    const repeatable = p.repeatable === undefined ? r.repeatable : p.repeatable;
    const archived = p.archived === undefined ? r.archived : p.archived;
    const section = Object.prototype.hasOwnProperty.call(p, 'section') ? p.section : r.section;
    // La finestra si può correggere anche su una missione già creata: senza
    // questo, cambiare un giorno voleva dire cancellarla e rifarla a mano.
    const da = Object.prototype.hasOwnProperty.call(p, 'da') ? p.da : r.active_from;
    const a  = Object.prototype.hasOwnProperty.call(p, 'a')  ? p.a  : r.active_to;
    if (title === r.title && description === r.description && repeatable === r.repeatable
        && archived === r.archived && section === r.section
        && da === r.active_from && a === r.active_to) {
      console.log(`= già a posto: ${r.title}`); continue;
    }
    db.prepare(`UPDATE missions SET title = ?, description = ?, repeatable = ?, archived = ?,
                section = ?, active_from = ?, active_to = ? WHERE id = ?`)
      .run(title, description, repeatable, archived, section, da, a, r.id);
    const note = [
      da !== r.active_from || a !== r.active_to
        ? (da ? `finestra ${da.slice(8, 10)}→${a.slice(8, 10)} agosto` : 'finestra rimossa') : null,
      repeatable !== r.repeatable ? (repeatable ? 'ora RIPETIBILE' : 'non più ripetibile') : null,
      archived !== r.archived ? (archived ? 'ora FLASH (nascosta)' : 'ora visibile') : null,
      section !== r.section ? (section ? `sezione ${section}` : 'tolta dalla sezione') : null,
    ].filter(Boolean).join(' · ');
    console.log(`✔ #${r.id} "${title}"${note ? ' · ' + note : ''}`);
    changed++;
  }
}
let removed = 0, nascoste = 0;
for (const r of RIMOZIONI) {
  const rows = db.prepare('SELECT id, title, archived, section FROM missions WHERE title LIKE ?').all(`%${r.find}%`);
  if (!rows.length) { console.log(`= già rimossa: ${r.find}`); continue; }
  for (const row of rows) {
    const prove = db.prepare('SELECT COUNT(*) c FROM submissions WHERE mission_id = ?').get(row.id).c;
    if (prove > 0) {
      // Cancellarla si porterebbe dietro le prove per effetto della cascata, e
      // chi l'aveva completata vedrebbe il punteggio scendere a festa in corso.
      // Se è già nascosta non si conta come modifica, altrimenti ogni rilancio
      // segnalerebbe un lavoro che non ha fatto.
      if (row.archived === 1 && row.section === null) {
        console.log(`= già nascosta: ${row.title} (${prove} prove, non si cancella)`);
        continue;
      }
      db.prepare('UPDATE missions SET archived = 1, section = NULL WHERE id = ?').run(row.id);
      console.log(`⚠️  #${row.id} "${row.title}" ha ${prove} prove: NON cancellata, solo nascosta (${r.perche})`);
      nascoste++;
    } else {
      db.prepare('DELETE FROM missions WHERE id = ?').run(row.id);
      console.log(`✖ #${row.id} "${row.title}" eliminata (${r.perche})`);
      removed++;
    }
  }
}

console.log(`Fatto: ${changed} missioni aggiornate, ${added} aggiunte, ${removed} eliminate, ${nascoste} nascoste.`);
const bySec = db.prepare("SELECT section, COUNT(*) c FROM missions WHERE section IS NOT NULL AND archived = 0 GROUP BY section").all();
console.log('Sezioni ora:', bySec.map((r) => `${r.section}=${r.c}`).join(' · '));
