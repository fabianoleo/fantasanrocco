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
// Le sessioni vivono in memoria: un riavvio le perde, e va bene cosi'
// (la partita in corso non conta, e non c'e' niente da salvare).
// ===================================================================
const crypto = require('crypto');

// ── Anti-cheat: sessioni di gioco lato server ───────────────────────────
// Il client NON è fidato. All'inizio della partita il server rilascia un
// "ticket" monouso con il PROPRIO timestamp; alla fine il punteggio viene
// validato rispetto al tempo realmente trascorso (orologio del server).
// Così non si può: gonfiare il punteggio, né accumulare "partite" spammando.
const gameSessions = new Map();   // token -> { userId, startMs }
function newGameSession(userId) {
  if (gameSessions.size > 8000) { // guardia memoria: elimina i 2000 più vecchi
    const old = [...gameSessions.entries()].sort((a, b) => a[1].startMs - b[1].startMs).slice(0, 2000);
    for (const [t] of old) gameSessions.delete(t);
  }
  const token = crypto.randomBytes(16).toString('hex');
  gameSessions.set(token, { userId, startMs: Date.now() });
  return token;
}
setInterval(() => {                // pulizia ticket scaduti (>1h)
  const cutoff = Date.now() - 3600 * 1000;
  for (const [t, s] of gameSessions) if (s.startMs < cutoff) gameSessions.delete(t);
}, 15 * 60 * 1000).unref?.();

module.exports = { gameSessions, newGameSession };
