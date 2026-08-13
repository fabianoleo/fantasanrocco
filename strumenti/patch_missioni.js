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
//   l'hai eliminata dal
//   pannello                  → NON la ricrea, e te lo scrive
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
const { MISSIONI, PTS, EMOJI, DAY, DAY_PIENO } = require('../src/dati/missioni');

const PROVA   = process.argv.includes('--prova');
const ELIMINA = process.argv.includes('--elimina');

// Il nome senza l'emoji della rarità. È la chiave con cui si riconosce una
// missione: se cambia rarità cambia l'emoji, ma il nome no — e senza questo
// una missione promossa da rara a epica sembrerebbe una missione nuova.
const nudo = (t) => String(t || '').replace(/^[^\p{L}\p{N}"'«(]+/u, '').trim();

// Da una voce dell'elenco alla riga che il database dovrebbe avere.
function attesa(x) {
  // Le FLASH prendono la giornata piena: le accende lo staff quando succede la
  // cosa, e una finestra che parte alle 18 combatterebbe con chi preme il
  // pulsante (Peppe Tap Tap passa quando passa).
  const win = x.win || (x.day ? ((x.flash ? DAY_PIENO : DAY)[x.day]) : [null, null]);
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

// Le missioni cancellate a mano dal pannello. Senza questo elenco, questo
// script le riportava in vita al primo lancio: vedeva che stavano nell'elenco
// e mancavano dal database, e le ricreava. Chi le aveva tolte se le ritrovava
// davanti senza aver fatto niente.
const rimosse = new Map(
  db.prepare('SELECT nome, quando FROM missioni_rimosse').all().map((r) => [r.nome, r.quando])
);

let creati = 0, corretti = 0, nascosti = 0, tolti = 0, avvisi = 0, saltati = 0;
const visti = new Set();

const lavoro = db.transaction(() => {
  // ── 1. Ogni voce dell'elenco, com'è scritta nell'elenco ──────────
  for (const x of MISSIONI) {
    const vuole = attesa(x);
    const chiave = nudo(vuole.title);
    visti.add(chiave);
    const riga = perNome.get(chiave);

    if (!riga && rimosse.has(chiave)) {
      console.log(`↩︎ "${vuole.title}" NON ricreata: l'hai eliminata dal pannello`
        + ` il ${rimosse.get(chiave).slice(0, 10)}.`);
      saltati++;
      continue;
    }

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
      if (!PROVA) db.prepare('DELETE FROM missioni_rimosse WHERE nome = ?').run(chiave);
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

const coda = saltati ? ` · ${saltati} NON ricreate perché eliminate a mano` : '';
console.log(PROVA
  ? `\nPROVA: niente è stato scritto. ${creati} da creare, ${corretti} da correggere, ${nascosti} da nascondere, ${tolti} da eliminare, ${avvisi} avvisi${coda}.`
  : `\nFatto: ${creati} create, ${corretti} corrette, ${nascosti} nascoste, ${tolti} eliminate, ${avvisi} avvisi${coda}.`);
if (saltati) {
  console.log('Per riaverne una: toglila da missioni_rimosse e rilancia —');
  console.log("  node -e \"require('./src/db').db.prepare('DELETE FROM missioni_rimosse WHERE nome = ?').run('Nome Missione')\"");
}

const sez = db.prepare("SELECT section s, COUNT(*) n FROM missions WHERE section IS NOT NULL AND archived = 0 GROUP BY s ORDER BY s").all();
console.log('Sezioni ora: ' + (sez.map((r) => `${r.s}=${r.n}`).join(' · ') || 'nessuna'));
