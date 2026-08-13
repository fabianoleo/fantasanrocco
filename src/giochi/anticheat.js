// ===================================================================
// FantaSanRocco — ANTI-CHEAT dei mini-giochi
// -------------------------------------------------------------------
// Il pezzo piu' delicato del progetto, e per questo sta da solo.
//
// Il client non e' mai fidato: a inizio partita il server rilascia un
// ticket monouso col PROPRIO timestamp, a fine partita il punteggio
// viene limitato dal tempo realmente trascorso secondo l'orologio del
// server. Senza ticket valido la partita non conta.
//
// I tetti orari NON si scelgono a occhio: si calcolano sulla fisica
// reale del gioco. E' gia' successo due volte di tagliare le partite
// oneste per un cap troppo basso, e chi tocca questi numeri deve
// rifare quel conto invece di indovinare.
//
// I TICKET STANNO NELLA SESSIONE, non in memoria. Prima vivevano in una
// Map: "un riavvio le perde, e va bene cosi'" diceva il commento, e con
// un riavvio ogni tanto era vero. Il 13 agosto ci sono stati cinque
// deploy in un giorno di festa: ogni volta TUTTE le partite in corso
// perdevano il ticket, e chi stava giocando si vedeva dire "partita
// troppo breve" dopo dieci minuti di gioco, oppure il punteggio tagliato
// a "record precedente + 3000" — successo a chi aveva fatto 21.000 punti
// a Corri San Rocco e se ne e' visti contare 14.000.
//
// La sessione e' salvata in SQLite (better-sqlite3-session-store), quindi
// sopravvive ai riavvii. E l'anti-cheat non ci perde niente, anzi: il
// timestamp resta scritto dal server e il client non lo tocca, e non
// serve piu' nemmeno controllare a chi appartiene il ticket — la
// sessione E' l'utente.
//
// Un ticket per gioco: chi tiene aperti il runner e il jetpack in due
// schede non si sovrascrive la partita dell'altro.
// ===================================================================
const crypto = require('crypto');

// Apre una partita e restituisce il ticket da rimandare indietro a fine
// gioco. `gioco` e' 'runner' o 'jetpack'.
function newGameSession(req, gioco) {
  const token = crypto.randomBytes(16).toString('hex');
  if (!req.session.partite) req.session.partite = {};
  req.session.partite[gioco] = { token, startMs: Date.now() };
  return token;
}

// Chiude la partita e restituisce { startMs }, oppure null se il ticket non
// c'e' o non corrisponde. MONOUSO: la seconda volta torna null, cosi' lo
// stesso ticket non puo' pagare due partite.
function takeGameSession(req, gioco, token) {
  const aperte = req.session.partite;
  const p = aperte && aperte[gioco];
  if (!p || !token || p.token !== token) return null;
  delete aperte[gioco];
  return p;
}

module.exports = { newGameSession, takeGameSession };
