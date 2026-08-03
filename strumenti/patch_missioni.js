// ===================================================================
// FantaSanRocco — Allinea le missioni all'elenco
// -------------------------------------------------------------------
// Prende src/dati/missioni.js e ci porta sopra il database che sta già
// girando, SENZA cancellare le prove inviate dai giocatori.
//
// Non c'è più niente da ricordare. Prima qui dentro viveva una lista di
// correzioni che si allungava a ogni giro — «a questa cambia la
// descrizione, a quest'altra la sezione» — e per modificare una missione
// bisognava sapere che cosa le era già stato fatto prima. Adesso si
// tocca SOLO l'elenco in src/dati/missioni.js: aggiungere, togliere o
// correggere una riga là basta, e questo script fa il resto.
//
// COSA FA, riga per riga dell'elenco:
//   manca nel database        → la crea
//   c'è ma è diversa          → la corregge (titolo, testo, punti,
//                               finestra, sezione, sponsor, ripetibile)
//   c'è nel database ma non
//   nell'elenco               → la NASCONDE e lo dice
//
// COSA NON TOCCA MAI, e perché:
//   · le missioni dei mini-giochi (game_key): le gestisce il gioco;
//   · se una missione è nascosta o visibile. È una leva dello STAFF —
//     una flash si sblocca a mano quando il momento arriva — e se questo
//     script la risistemasse a ogni lancio, rimetterebbe il coperchio
//     su una flash appena aperta. Le differenze le segnala e basta;
//   · non cancella NIENTE da solo. Le missioni di troppo le archivia,
//     che è reversibile con un clic. Per cancellarle davvero serve
//     --elimina, e comunque mai quelle con delle prove già inviate.
//
// Uso (in produzione, dentro il container):
//   cd /app && node strumenti/patch_missioni.js            applica
//   cd /app && node strumenti/patch_missioni.js --prova    mostra e basta
//   cd /app && node strumenti/patch_missioni.js --elimina  toglie davvero
//                                                          quelle di troppo
// ===================================================================
const { db } = require('../src/db');
const { MISSIONI, PTS, EMOJI, DAY } = require('../src/dati/missioni');

const PROVA   = process.argv.includes('--prova');
const ELIMINA = process.argv.includes('--elimina');

// Il nome senza l'emoji della rarità. È la chiave con cui si riconosce una
// missione: se cambia rarità cambia l'emoji, ma il nome no — e senza questo
// una missione promossa da rara a epica sembrerebbe una missione nuova.
const nudo = (t) => String(t || '').replace(/^[^\p{L}\p{N}"'«(]+/u, '').trim();

// Da una voce dell'elenco alla riga che il database dovrebbe avere.
function attesa(x) {
  const win = x.win || (x.day ? DAY[x.day] : [null, null]);
  return {
    title: `${EMOJI[x.rar]} ${x.name}`,
    description: x.desc,
    points: PTS[x.rar],
    requires_photo: x.photo === false ? 0 : 1,
    repeatable: x.rep ? 1 : 0,
    active_from: win[0] || null,
    active_to: win[1] || null,
    section: x.sec || null,
    giorni_attivi: x.giorni || null,
    sponsor: x.sponsor || null,
  };
}

// I campi che questo script tiene allineati. `archived` NON è qui dentro:
// vedi l'intestazione, è una leva dello staff.
const CAMPI = ['title', 'description', 'points', 'requires_photo', 'repeatable',
               'active_from', 'active_to', 'section', 'giorni_attivi', 'sponsor'];

const quando = (r) => {
  if (r.giorni_attivi) return `giorni ${r.giorni_attivi}`;
  if (!r.active_from) return 'sempre';
  const d = r.active_from.slice(8, 10), a = (r.active_to || '').slice(8, 10);
  return d === a ? `${d} agosto` : `${d}→${a} agosto`;
};

const inDb = db.prepare('SELECT * FROM missions WHERE game_key IS NULL').all();
const perNome = new Map(inDb.map((r) => [nudo(r.title), r]));

let creati = 0, corretti = 0, nascosti = 0, tolti = 0, avvisi = 0;
const visti = new Set();

const lavoro = db.transaction(() => {
  // ── 1. Ogni voce dell'elenco, com'è scritta nell'elenco ──────────
  for (const x of MISSIONI) {
    const vuole = attesa(x);
    const chiave = nudo(vuole.title);
    visti.add(chiave);
    const riga = perNome.get(chiave);

    if (!riga) {
      if (!PROVA) {
        db.prepare(`INSERT INTO missions
          (title, description, points, requires_photo, repeatable, active_from,
           active_to, archived, section, giorni_attivi, sponsor)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(vuole.title, vuole.description, vuole.points, vuole.requires_photo,
            vuole.repeatable, vuole.active_from, vuole.active_to, x.flash ? 1 : 0,
            vuole.section, vuole.giorni_attivi, vuole.sponsor);
      }
      console.log(`＋ "${vuole.title}" · ${vuole.points}pt · ${quando(vuole)}`
        + (x.flash ? ' · FLASH (nasce nascosta)' : '')
        + (vuole.requires_photo ? '' : ' · senza foto'));
      creati++;
      continue;
    }

    const diversi = CAMPI.filter((c) => (riga[c] ?? null) !== (vuole[c] ?? null));
    if (diversi.length) {
      if (!PROVA) {
        db.prepare(`UPDATE missions SET ${CAMPI.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
          .run(...CAMPI.map((c) => vuole[c]), riga.id);
      }
      console.log(`✔ #${riga.id} "${vuole.title}" · ${diversi.join(', ')}`);
      corretti++;
    }

    // La visibilità non la tocchiamo, ma se non combacia va detto: una
    // flash che nell'elenco non è più flash resta nascosta finché non la
    // sblocca qualcuno, e senza questo avviso nessuno se ne accorge.
    const dovrebbeEssereNascosta = x.flash ? 1 : 0;
    if (riga.archived !== dovrebbeEssereNascosta) {
      console.log(`⚠️  #${riga.id} "${vuole.title}" è ${riga.archived ? 'NASCOSTA' : 'visibile'}`
        + ` ma nell'elenco è ${dovrebbeEssereNascosta ? 'una flash' : 'una missione normale'}`
        + ' — decidilo tu dal pannello (spunta «Archivia»).');
      avvisi++;
    }
  }

  // ── 2. Quello che sta nel database ma non nell'elenco ────────────
  for (const riga of inDb) {
    if (visti.has(nudo(riga.title))) continue;
    const prove = db.prepare('SELECT COUNT(*) c FROM submissions WHERE mission_id = ?').get(riga.id).c;

    if (ELIMINA && prove === 0) {
      if (!PROVA) db.prepare('DELETE FROM missions WHERE id = ?').run(riga.id);
      console.log(`✖ #${riga.id} "${riga.title}" eliminata (non è nell'elenco)`);
      tolti++;
      continue;
    }
    if (riga.archived === 1 && riga.section === null) continue;   // già fuori gioco
    if (!PROVA) db.prepare('UPDATE missions SET archived = 1, section = NULL WHERE id = ?').run(riga.id);
    console.log(`✖ #${riga.id} "${riga.title}" NASCOSTA: non è nell'elenco`
      + (prove ? ` · ha ${prove} prove, quindi non si cancella` : ' · usa --elimina per toglierla del tutto'));
    nascosti++;
  }
});

lavoro();

console.log(PROVA
  ? `\nPROVA: niente è stato scritto. ${creati} da creare, ${corretti} da correggere, ${nascosti} da nascondere, ${tolti} da eliminare, ${avvisi} avvisi.`
  : `\nFatto: ${creati} create, ${corretti} corrette, ${nascosti} nascoste, ${tolti} eliminate, ${avvisi} avvisi.`);

const sez = db.prepare("SELECT section s, COUNT(*) n FROM missions WHERE section IS NOT NULL AND archived = 0 GROUP BY s ORDER BY s").all();
console.log('Sezioni ora: ' + (sez.map((r) => `${r.s}=${r.n}`).join(' · ') || 'nessuna'));
