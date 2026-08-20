// ===================================================================
// FantaSanRocco — QUANTO ABBIAMO RACCOLTO (riga di comando)
// -------------------------------------------------------------------
// Scrive su disco il foglio per contare la raccolta: per ogni prova
// approvata la foto, il nickname, la data e la nota, più una casella per
// l'importo che si somma da sola mentre scrivi. Dove la cifra è già nella
// nota («ho donato 10€») la casella arriva precompilata; il resto lo leggi
// dalle foto. Gli importi restano nel browser (localStorage): se chiudi per
// sbaglio non ricominci da capo.
//
// Il motore sta in src/lib/beneficenza.js, non qui: lo stesso foglio serve
// anche al pannello admin (/admin/beneficenza), e due copie della stessa
// tabella prima o poi avrebbero contato in modo diverso.
//
// USO
//   node strumenti/beneficenza.js [--db <file.db>] [--foto <cartella>]
//                                 [--missione "Cuore d'Oro"] [--out <file.html>]
//
// Senza argomenti punta al database e alle foto dell'installazione: dentro il
// container basta `cd /app && node strumenti/beneficenza.js`.
//
// ATTENZIONE A DOVE LO SCRIVI: le foto non sono incorporate nel file, sono
// linkate per percorso relativo. Il foglio funziona solo finché resta dove
// l'hai generato, accanto alla cartella delle foto. Se devi guardarlo da un
// altro computer non spostare il file: usa /admin/beneficenza, che serve lo
// stesso foglio dal sito e le foto le prende da lì.
//
// Lavora in SOLA LETTURA. Puntarlo a una copia (uno dei backup in
// data/backups) va benissimo ed è la cosa prudente.
// ===================================================================
const fs = require('fs');
const path = require('path');
const { raccogli, foglio } = require('../src/lib/beneficenza');

function arg(nome, fallback) {
  const i = process.argv.indexOf('--' + nome);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const DB_FILE  = arg('db', path.join(__dirname, '..', 'data', 'fantasanrocco.db'));
const FOTO_DIR = arg('foto', path.join(__dirname, '..', 'data', 'uploads'));
const MISSIONE = arg('missione', "Cuore d'Oro");
const USCITA   = arg('out', path.join(process.cwd(), 'raccolta-beneficenza.html'));

if (!fs.existsSync(DB_FILE)) {
  console.error(`Database non trovato: ${DB_FILE}\nPassalo con --db <file>`);
  process.exit(1);
}

const Database = require('better-sqlite3');
const db = new Database(DB_FILE, { readonly: true });

let dati;
try {
  dati = raccogli(db, { missione: MISSIONE, fotoDir: FOTO_DIR });
} catch (e) {
  console.error(e.message);
  if (e.missioniPresenti) {
    console.error('Missioni presenti:');
    e.missioniPresenti.forEach((m) => console.error(`   #${m.id}  ${m.title}`));
  }
  process.exit(1);
}

// Il percorso delle foto visto DAL FILE che stiamo scrivendo, non da qui.
const relFoto = path.relative(path.dirname(USCITA), FOTO_DIR) || '.';
fs.writeFileSync(USCITA, foglio(dati, { baseFoto: relFoto }));

console.log(`Missione: «${dati.missione.title}» (${dati.missione.points} punti)`);
console.log(`Prove approvate: ${dati.voci.length}   persone: ${dati.donatori}`);
console.log(`Importi già leggibili dalle note: ${dati.precompilati}`
  + `${dati.precompilati ? '' : ' — le cifre stanno solo nelle foto'}`);
if (dati.senzaFoto) console.log(`⚠  ${dati.senzaFoto} prove senza il file foto in ${FOTO_DIR}`);
console.log(`\nFoglio scritto in: ${USCITA}`);
console.log('Aprilo nel browser, scrivi le cifre e il totale si somma da solo.');
console.log('Se devi guardarlo da un altro computer usa /admin/beneficenza: stesso foglio, servito dal sito.');
