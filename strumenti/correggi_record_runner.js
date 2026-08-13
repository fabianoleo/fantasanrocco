// ===================================================================
// FantaSanRocco — Rimette a posto un record di «Corri San Rocco»
// -------------------------------------------------------------------
// Serve per le partite che il server ha contato meno di quello che erano,
// per via del bug dei ticket persi ai riavvii (corretto il 13 agosto).
// Chi era in gioco durante un deploy si vedeva limitare il punteggio a
// "record precedente + 3.000": ThatWhoPlays23 ha fatto 21.015 e ne ha
// visti contare 14.058.
//
// Uso (in produzione, dentro il container):
//   cd /app && node strumenti/correggi_record_runner.js ThatWhoPlays23 21015
//   cd /app && node strumenti/correggi_record_runner.js ThatWhoPlays23 21015 --applica
//
// Senza --applica non scrive NIENTE.
//
// NON basta cambiare il numero del record: i traguardi del runner sono
// missioni, e si conquistano quando il punteggio le supera. Se si alzasse
// solo `game_best`, quelli fra il vecchio e il nuovo punteggio resterebbero
// non conquistati per sempre — insieme ai loro punti. Questo script fa
// tutte e due le cose, con lo STESSO codice del gioco: inserisce una prova
// approvata per la missione del traguardo, esattamente come farebbe una
// partita vera.
//
// SERVE UNA PROVA. Un record si alza solo con qualcosa da guardare: la
// storia su Instagram, uno screenshot, il video. Non e' un dettaglio
// burocratico — e' l'unica cosa che distingue una correzione da un regalo,
// e senza qualcuno lo chiedera' avendo solo la memoria dalla sua parte.
// ===================================================================
const { db } = require('../src/db');
const { GAME_ACHIEVEMENTS, ensureGameMissions, gameMissionId } = require('../src/giochi/traguardi');

const [nick, punteggioArg] = process.argv.slice(2);
const APPLICA = process.argv.includes('--applica');
const nuovo = parseInt(punteggioArg, 10);

if (!nick || !Number.isFinite(nuovo)) {
  console.log('Uso: node strumenti/correggi_record_runner.js <nickname> <punteggio> [--applica]');
  process.exit(1);
}

const u = db.prepare('SELECT id, nickname, game_best, game_plays FROM users WHERE nickname = ?').get(nick);
if (!u) { console.log(`Nessun utente con nickname "${nick}".`); process.exit(1); }

console.log('');
console.log(`${u.nickname} · record attuale ${u.game_best.toLocaleString('it-IT')} → ${nuovo.toLocaleString('it-IT')}`);

if (nuovo <= u.game_best) {
  console.log('Il nuovo punteggio non è più alto di quello che ha già: non c\'è niente da correggere.');
  process.exit(0);
}
// Il tetto assoluto del gioco: sopra quello nemmeno una partita vera puo'
// andare, quindi un numero piu' alto e' un errore di battitura o una bugia.
const TETTO = 38000;
if (nuovo > TETTO) {
  console.log(`⛔ ${nuovo.toLocaleString('it-IT')} sta sopra il massimo possibile del gioco (${TETTO.toLocaleString('it-IT')}). Non procedo.`);
  process.exit(1);
}

// Le missioni-traguardo devono esistere prima di potervi appendere una prova.
ensureGameMissions();

const daDare = [];
for (const a of GAME_ACHIEVEMENTS) {
  if (a.metric !== 'score' || nuovo < a.threshold) continue;
  const mid = gameMissionId(a.key);
  if (!mid) continue;
  const gia = db.prepare("SELECT 1 FROM submissions WHERE user_id = ? AND mission_id = ? AND status = 'approved'")
    .get(u.id, mid);
  if (gia) continue;
  daDare.push({ ...a, mid });
}

if (!daDare.length) {
  console.log('Nessun traguardo da assegnare: li aveva già tutti fino a questo punteggio.');
} else {
  console.log('');
  console.log('Traguardi che gli spettano e non ha:');
  for (const a of daDare) {
    console.log(`   ${a.threshold.toLocaleString('it-IT').padStart(7)} punti → ${String(a.points).padStart(4)}pt · ${a.title}`);
  }
  console.log(`   in tutto ${daDare.reduce((t, a) => t + a.points, 0)} punti in classifica`);
}

if (!APPLICA) {
  console.log('');
  console.log('PROVA — non ho scritto niente. Per applicare davvero, riaggiungi --applica');
  console.log('');
  process.exit(0);
}

db.transaction(() => {
  db.prepare('UPDATE users SET game_best = ? WHERE id = ?').run(nuovo, u.id);
  for (const a of daDare) {
    // Stessa riga che scriverebbe una partita vera (vedi /gioco/punteggio in
    // server.js): cosi' il traguardo compare nel profilo come conquistato e
    // non come un punto arrivato da chissa' dove.
    db.prepare(`INSERT INTO submissions (user_id, mission_id, status, note, review_note)
                VALUES (?, ?, 'approved', 'mini-gioco', 'correzione record')`).run(u.id, a.mid);
  }
})();

console.log('');
console.log(`✔ Record portato a ${nuovo.toLocaleString('it-IT')} e assegnati ${daDare.length} traguardi.`);
console.log('  Nel suo profilo li trova come conquistati, non come punti piovuti dal cielo.');
console.log('');
