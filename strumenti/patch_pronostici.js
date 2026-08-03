// ===================================================================
// FantaSanRocco — Porta il database sopra l'elenco dei pronostici
// -------------------------------------------------------------------
// Prende src/dati/pronostici.js e ci adegua quello che sta nel database,
// SENZA perdere i voti già dati. Stessa idea di patch_missioni.js: per
// cambiare un pronostico si tocca solo il file dei dati.
//
// Uso (in produzione, dentro il container):
//   cd /app && node strumenti/patch_pronostici.js
//   cd /app && node strumenti/patch_pronostici.js --prova    (non scrive niente)
//
// NON tocca `winner` né `open`: la risposta giusta e l'apertura le decide
// lo staff dal pannello, e riscriverle da qui vorrebbe dire stornare i
// punti già dati a chi aveva indovinato.
// ===================================================================
const { db } = require('../src/db');
const { PRONOSTICI } = require('../src/dati/pronostici');

const PROVA = process.argv.includes('--prova');

// I campi che questo script tiene allineati. `points` c'è: se cambia
// quanto vale un pronostico ancora aperto, deve poterlo seguire.
const CAMPI = ['description', 'options', 'points', 'multi', 'closes_at'];

let creati = 0, corretti = 0, avvisi = 0;

const inDb = db.prepare('SELECT * FROM predictions').all();
const perTitolo = new Map(inDb.map((r) => [r.title, r]));

for (const p of PRONOSTICI) {
  const vuole = {
    title: p.title,
    description: p.description || '',
    options: JSON.stringify(p.options),
    points: p.points,
    multi: p.multi ? 1 : 0,
    closes_at: p.closes_at || null,
  };
  const riga = perTitolo.get(p.title);

  if (!riga) {
    if (!PROVA) {
      // Nascono IN CANTIERE (archived = 1): li pubblica lo staff dal pannello
      // quando decide. Se nascessero visibili, lanciare lo script vorrebbe dire
      // far comparire di colpo cinque pronostici, magari giorni prima.
      db.prepare(`INSERT INTO predictions (title, description, options, points, multi, closes_at, open, archived)
                  VALUES (?, ?, ?, ?, ?, ?, 1, 1)`)
        .run(vuole.title, vuole.description, vuole.options, vuole.points, vuole.multi, vuole.closes_at);
    }
    console.log(`＋ "${p.title}" · ${p.points}pt · ${p.options.length} opzioni · chiude ${p.closes_at || 'a mano'}`);
    creati++;
    continue;
  }

  const diversi = CAMPI.filter((c) => (riga[c] ?? null) !== (vuole[c] ?? null));
  if (!diversi.length) { console.log(`= "${p.title}" già a posto`); continue; }

  // Se qualcuno ha già indovinato, cambiare le opzioni sposterebbe gli
  // indici e la risposta giusta finirebbe su un colore diverso: meglio
  // fermarsi e dirlo che rovinare i punti già dati.
  if (diversi.includes('options') && riga.winner !== null) {
    console.log(`⚠️  "${p.title}": le opzioni sono cambiate ma la risposta è già stata dichiarata.`
      + ' NON le tocco — cambiarle sposterebbe gli indici e i punti finirebbero al colore sbagliato.');
    avvisi++;
    continue;
  }

  if (!PROVA) {
    db.prepare(`UPDATE predictions SET ${CAMPI.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...CAMPI.map((c) => vuole[c]), riga.id);
  }
  console.log(`✔ #${riga.id} "${p.title}" · ${diversi.join(', ')}`);
  corretti++;
}

console.log('');
console.log(`${PROVA ? 'PROVA — non ho scritto niente. ' : ''}`
  + `creati ${creati} · corretti ${corretti} · avvisi ${avvisi}`);
if (creati || corretti) {
  console.log('I pronostici nuovi nascono IN CANTIERE: non li vede nessuno finche\' non');
  console.log('li pubblichi dal pannello (Pronostici → Pubblica). Lì decidi anche se');
  console.log('mandare la notifica a tutti: e\' una spunta, non parte da sola.');
  console.log('La risposta giusta la dichiari sempre dal pannello, sera per sera.');
}
