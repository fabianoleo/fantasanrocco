// ===================================================================
// FantaSanRocco — Seed missioni 2026 (sistema di rarità)
// -------------------------------------------------------------------
// ⚠️  CANCELLA TUTTE le missioni esistenti (e, a cascata, le relative
//     prove/submissions) e inserisce l'elenco nuovo qui sotto.
//     Il pronostico del Palio NON è una missione: resta intatto.
//
// Rarità → punti:  ⚪ Comune 25 · 🟢 Non comune 50 · 🔵 Rara 100 ·
//                  🟣 Epica 250 · 🟠 Leggendaria 500
//
// Uso (in produzione, dentro il container):  node src/seed_missioni_2026.js
// ===================================================================
const { db } = require('./db');

const PTS = { comune: 25, 'non-comune': 50, rara: 100, epica: 250, leggendaria: 500 };
const EMOJI = { comune: '⚪', 'non-comune': '🟢', rara: '🔵', epica: '🟣', leggendaria: '🟠' };

// Finestre "giorno festa" per le sfide giornaliere (ora italiana; il server le
// interpreta come Europe/Rome). Ogni sfida è visibile solo nel suo giorno.
const DAY = {
  14: ['2026-08-14 00:00:00', '2026-08-14 23:59:59'],
  15: ['2026-08-15 00:00:00', '2026-08-15 23:59:59'],
  16: ['2026-08-16 00:00:00', '2026-08-16 23:59:59'],
  17: ['2026-08-17 00:00:00', '2026-08-17 23:59:59'],
  18: ['2026-08-18 00:00:00', '2026-08-18 23:59:59'],
};

// m(nome, descrizione, rarità, opzioni)
// opzioni: { rep: ripetibile più volte al giorno, day: N sfida giornaliera,
//            flash: true → creata NASCOSTA (la attivi tu quando parte il flash),
//            photo: false → non richiede foto (es. parola segreta) }
function m(name, desc, rar, opt = {}) {
  return { name, desc, rar, ...opt };
}

const MISSIONS = [
  // ── PAESE & TRADIZIONE (16) ──────────────────────────────────────
  m('Primo Cittadino', 'Scatta una foto con il Sindaco di Siano.', 'rara', { sec: 'paese' }),
  m('Cantiere', 'Scatta una foto di un anziano che critica un lavoro pubblico.', 'non-comune', { sec: 'paese' }),
  m('Asso di Mazze', 'Scatta una foto di una partita a carte davanti alla Chiesa.', 'comune', { sec: 'paese' }),
  m('Fuori Orario', 'Scatta una foto davanti a un bar dopo la chiusura.', 'comune', { sec: 'paese' }),
  m("E' Tiemp Bell...", "Pubblica una foto anni '80 sul gruppo Facebook del paese (Sei di Siano se…).", 'non-comune', { sec: 'paese' }),
  m("Ngopp a' Cappell", 'Scatta una foto panoramica del paese.', 'non-comune', { sec: 'paese' }),
  m("Annanz' a Chies", 'Scatta una foto sulle scale della chiesa.', 'comune', { sec: 'paese' }),
  m('Benvenuti a Siano', 'Scatta una foto davanti alla scritta con una posa creativa.', 'non-comune', { sec: 'paese' }),
  m('Colazione dei Campioni', 'Fai colazione con i vestiti della sera prima e scatta una foto.', 'non-comune', { sec: 'paese' }),
  m('Quattro Frecce', 'Scatta una foto di un parcheggio creativo (targa oscurata).', 'comune', { sec: 'paese' }),
  m('Il Pacco', 'Scatta una foto con il postino o corriere.', 'non-comune', { sec: 'paese' }),
  m("A' Machina Zozzosa", 'Scatta una foto ad un’auto impolverata sulla quale sia stata scritta la parola "FantaSanRocco".', 'rara', { sec: 'paese' }),
  m('A Per', 'Spostati con un mezzo alternativo e scatta una foto.', 'rara', { sec: 'paese' }),
  m('Tap Tap', 'Scatta un selfie con Peppe Tap Tap.', 'non-comune', { sec: 'paese' }),
  m('Tradizione', 'Impara una tradizione da un anziano e documentalo con una foto.', 'rara', { sec: 'paese' }),
  m('Bollino', 'Scatta una foto con un adesivo del logo "Fanta San Rocco".', 'rara', { sec: 'paese' }),

  // ── FOOD & DRINK (7) ─────────────────────────────────────────────
  m('Leccucci', 'Scatta una foto con il sacchetto di caramelle comprato alle bancarelle.', 'comune', { sec: 'food' }),
  m("A' Braciol e' Capr", 'Scatta una foto del piatto tipico sianese.', 'comune', { sec: 'food' }),
  m("O' Vin ca Percoc e Nu…", 'Scatta una foto del famoso "vino con la percoca".', 'comune', { sec: 'food' }),
  m('Lo Zio di Siano', 'Scatta una foto mentre bevi con Zio Max.', 'rara', { sec: 'food' }),
  m("O' Mast", 'Scatta una foto mentre bevi con il proprietario di un bar.', 'rara', { sec: 'food' }),
  m("Ngopp o' Pont", 'Scatta una foto con il paninaro di "ngopp o’ pont".', 'rara', { sec: 'food' }),
  m('Fila Infinita', 'Scatta una foto mentre sei in una lunga fila al bar.', 'non-comune', { sec: 'food' }),

  // ── SOCIAL & PARTY (15) ──────────────────────────────────────────
  m('Rocco', 'Scatta una foto con una persona di nome Rocco.', 'non-comune', { rep: true, sec: 'social' }),
  m('Kiss Kiss', 'Scatta una foto mentre dai baci durante la festa.', 'comune', { rep: true, sec: 'social' }),
  m('Spia', 'Scatta una foto mentre si compie un malus da definire.', 'epica', { sec: 'social' }),
  m("Miettc a' Man Toji", 'Scatta un selfie in chiesa con la statua di un Santo.', 'non-comune', { sec: 'social' }),
  m('Trash Royale', 'Pubblica una storia Instagram volutamente trash sul tuo profilo pubblico taggando "Fanta SanRocco".', 'rara', { sec: 'social' }),
  m('Maracaibo', 'Entra in un trenino umano che balla e scatta una foto.', 'non-comune', { sec: 'social' }),
  m('Mangiata', 'Scatta un selfie durante una mangiata sulla terra.', 'epica', { sec: 'social' }),
  m('On Air', 'Fatti intervistare da chi fa riprese/interviste ufficiali dell’evento.', 'epica', { sec: 'social' }),
  m('Pigiama Party', 'Scatta una foto in pigiama davanti la chiesa.', 'epica', { sec: 'social' }),
  m('Cover', 'Ricrea una famosa foto di gruppo (es. "L’Ultima Cena" o una copertina iconica) con gli amici.', 'rara', { sec: 'social' }),
  m('Glitch', 'Trova due persone vestite uguali e fai una foto con entrambe.', 'rara', { sec: 'social' }),
  m('Facciamo i Seri', 'Scatta una foto in cui NESSUNO ride.', 'comune', { sec: 'social' }),
  m('Calici in Alto', 'Scatta una foto in cui tutti alzano i bicchieri.', 'comune', { sec: 'social' }),
  m('Cecchino', 'Scatta una foto con il pupazzo vinto sparando alle lattine.', 'non-comune', { sec: 'social' }),
  m("Nu Gir Ngopp a Giostr", 'Scatta una foto mentre fai un giro su una giostra presente alla festa.', 'comune', { sec: 'social' }),

  // ── SPORT, TEAM & COMUNITÀ (9) ───────────────────────────────────
  m('Partitella', 'Scatta una foto durante una partita con il pallone in piazza.', 'non-comune', { sec: 'sport' }),
  m('Ultras', 'Scatta una foto indossando la maglia di una squadra di calcio del paese.', 'non-comune', { sec: 'sport' }),
  m('Dirigenza', 'Scatta una foto con un dirigente di una delle squadre di calcio del paese.', 'non-comune', { sec: 'sport' }),
  m('Man of the Match', 'Scatta una foto con un calciatore di una delle squadre del paese.', 'non-comune', { rep: true, sec: 'sport' }),
  m('Meet the Team', 'Scatta una foto con uno dei membri del team "Fanta San Rocco".', 'rara', { sec: 'sport' }),
  m('Benedizione', 'Scatta una foto con il parroco.', 'rara', { sec: 'sport' }),
  m("A' Ciort", 'Acquista un biglietto della lotteria di San Rocco e documentalo con una foto.', 'epica', { sec: 'sport' }),
  m("Cuore d'Oro", 'Compi un gesto di beneficenza per il Malawi e documentalo con una foto.', 'leggendaria', { sec: 'sport' }),
  m('Musica Maestro', 'Scatta un selfie con la banda musicale.', 'rara', { sec: 'sport' }),

  // ── SFIDE GIORNALIERE — 14 AGOSTO ────────────────────────────────
  m('Mazzariello', 'Scatta una foto con Mazzariello.', 'rara', { day: 14 }),
  m('Arlecchino Rosso', 'Indossa un capo/accessorio rosso e scatta una foto.', 'non-comune', { day: 14 }),
  m('Fanta SanRocco', 'Seleziona dalla galleria la foto del telo "Fanta SanRocco"… sempre se l’hai fatta!', 'leggendaria', { day: 14 }),
  m('Selfie XXL', 'Flash! Fai entrare almeno 15 persone nello stesso selfie.', 'epica', { flash: true }),

  // ── SFIDE GIORNALIERE — 15 AGOSTO ────────────────────────────────
  m('Napoliitudine', 'Scatta una foto con un membro della band "Napoliitudine".', 'epica', { day: 15 }),
  m('Arlecchino Arancione', 'Indossa un capo/accessorio arancione e scatta una foto.', 'non-comune', { day: 15 }),
  m('Il Tesoro Perduto', 'Flash! Completa la Caccia al Tesoro seguendo gli indizi dello staff.', 'leggendaria', { flash: true }),

  // ── SFIDE GIORNALIERE — 16 AGOSTO ────────────────────────────────
  m('Arlecchino Verde', 'Indossa un capo/accessorio verde e scatta una foto.', 'non-comune', { day: 16 }),
  m('Festa dei Folli', 'Immortala un’esibizione "pazza"!', 'epica', { day: 16 }),
  m('Skin', 'Scatta una foto indossando un outfit dello stesso colore del sindaco.', 'epica', { day: 16 }),
  m('Momento Solenne', 'Riprendi l’entrata/uscita di San Rocco dalla chiesa durante la processione.', 'non-comune', { day: 16 }),
  m('Compleanno Leggendario', 'Scatta una foto con chi compie gli anni a San Rocco (ancora meglio se si chiama Rocco).', 'leggendaria', { day: 16 }),
  m("Spalla d'Onore", 'Scatta una foto mentre porti San Rocco durante la processione.', 'epica', { day: 16 }),
  m('Il Portatore', 'Scatta una foto mentre si porta un santo durante la processione.', 'rara', { day: 16 }),
  m('In Cammino', 'Scatta una foto mentre partecipi alla processione.', 'comune', { day: 16 }),
  m('Limited Edition', 'Scatta un selfie con Rocco Botta mentre indossa la sua maglietta personalizzata.', 'epica', { day: 16 }),

  // ── SFIDE GIORNALIERE — 17 AGOSTO ────────────────────────────────
  m('Arlecchino Giallo', 'Indossa un capo/accessorio giallo e scatta una foto.', 'non-comune', { day: 17 }),
  m('Alfonso Leo', 'Scatta una foto di Alfonso Leo che presenta i cantanti.', 'non-comune', { day: 17 }),
  m('Shh… non dirlo a nessuno!', 'Individua uno dei membri del team e scrivi qui nella nota la parola segreta che ti forniranno.', 'epica', { day: 17, photo: false }),
  m('In Bilico', 'Flash! Tutti in posa, ma su una sola gamba!', 'epica', { flash: true }),

  // ── SFIDE GIORNALIERE — 18 AGOSTO ────────────────────────────────
  m('Campanile ON!', 'Scatta una foto durante l’accensione del campanile.', 'rara', { day: 18 }),
  m('Prima Fila', 'Scatta una foto mentre prendi posto a Piazza Mercato.', 'non-comune', { day: 18 }),
  m('Tutti Pronti', 'Scatta una foto della spesa per i fuochi.', 'non-comune', { day: 18 }),
  m('Tutti in Cerchio', 'Flash! Prendetevi per mano e formate un cerchio. Ricorda di scattare la foto!', 'epica', { flash: true }),
];

const insert = db.prepare(`INSERT INTO missions
  (title, description, points, requires_photo, repeatable, active_from, active_to, archived, section)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const run = db.transaction(() => {
  const before = db.prepare('SELECT COUNT(*) AS c FROM missions').get().c;
  db.prepare('DELETE FROM missions').run();   // cascata: elimina anche le submissions collegate
  for (const x of MISSIONS) {
    const title = `${EMOJI[x.rar]} ${x.name}`;
    const points = PTS[x.rar];
    const win = x.day ? DAY[x.day] : [null, null];
    insert.run(
      title,
      x.desc,
      points,
      x.photo === false ? 0 : 1,
      x.rep ? 1 : 0,
      win[0],
      win[1],
      x.flash ? 1 : 0,
      x.sec || null,
    );
  }
  return before;
});

const before = run();
const after = db.prepare('SELECT COUNT(*) AS c FROM missions').get().c;
const flash = db.prepare('SELECT COUNT(*) AS c FROM missions WHERE archived = 1').get().c;
const rep = db.prepare('SELECT COUNT(*) AS c FROM missions WHERE repeatable = 1').get().c;
const daily = db.prepare('SELECT COUNT(*) AS c FROM missions WHERE active_from IS NOT NULL').get().c;
const bySec = db.prepare("SELECT section, COUNT(*) c FROM missions WHERE section IS NOT NULL GROUP BY section").all();
console.log(`Missioni: ${before} eliminate → ${after} inserite (${flash} flash nascoste, ${rep} ripetibili, ${daily} giornaliere).`);
console.log('Sezioni:', bySec.map((r) => `${r.section}=${r.c}`).join(' · '));
