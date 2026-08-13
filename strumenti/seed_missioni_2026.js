// ===================================================================
// FantaSanRocco — Seed missioni 2026 (ricomincia da capo)
// -------------------------------------------------------------------
// ⚠️  CANCELLA TUTTE le missioni esistenti e, a cascata, LE PROVE già
//     inviate dai giocatori. Si usa solo per ripartire da zero.
//     A festa iniziata NON si lancia: si usa patch_missioni.js, che
//     allinea il database allo stesso elenco senza perdere niente.
//     Il pronostico del Palio non è una missione: resta intatto.
//
// L'elenco delle missioni sta in src/dati/missioni.js, non qui.
//
// Uso (in produzione, dentro il container):  node strumenti/seed_missioni_2026.js
// ===================================================================
const { db } = require('../src/db');
const { MISSIONI, PTS, EMOJI, DAY, DAY_PIENO } = require('../src/dati/missioni');


const insert = db.prepare(`INSERT INTO missions
  (title, description, points, requires_photo, repeatable, active_from, active_to, archived, section, giorni_attivi, sponsor)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const run = db.transaction(() => {
  const before = db.prepare('SELECT COUNT(*) AS c FROM missions').get().c;
  db.prepare('DELETE FROM missions').run();   // cascata: elimina anche le submissions collegate
  for (const x of MISSIONI) {
    const title = `${EMOJI[x.rar]} ${x.name}`;
    const points = PTS[x.rar];
    // Le FLASH prendono la giornata piena, come in patch_missioni.js: le
    // accende lo staff quando la cosa succede, e una finestra che parte
    // alle 18 combatterebbe con chi preme il pulsante.
    const win = x.win || (x.day ? ((x.flash ? DAY_PIENO : DAY)[x.day]) : [null, null]);
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
      x.giorni || null,
      x.sponsor || null,
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
