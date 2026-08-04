// ===================================================================
// FantaSanRocco — EMAIL BLOCCATE
// -------------------------------------------------------------------
// Quando si cancella un account si può decidere che quella email non
// possa più iscriversi. Serve contro chi si fabbrica gli account per
// farsi i punti degli inviti: senza, cancellarli è una fatica inutile,
// perché lo stesso indirizzo ricrea lo stesso profilo un minuto dopo.
//
// L'email NON viene conservata in chiaro. Cancellare un account è il
// diritto all'oblio, e tenersi l'indirizzo leggibile lo svuoterebbe:
// qui resta l'impronta, che sa rispondere "questa è bloccata?" e nulla
// più, e una versione mascherata perché chi amministra la lista deve
// poter riconoscere la riga da sbloccare quando ha sbagliato.
//
// Il blocco vale SOLO per le nuove iscrizioni. Non è una lista nera
// dell'accesso: gli account vivi con quella email — se ce ne fossero —
// continuano a entrare normalmente.
// ===================================================================
const crypto = require('crypto');
const { db } = require('../db');

// Stessa normalizzazione che usa la registrazione (trim + minuscole):
// se le due divergessero, "Mario@x.it" passerebbe attraverso un blocco
// messo su "mario@x.it".
function normalizza(email) {
  return String(email || '').trim().toLowerCase();
}

function impronta(email) {
  return crypto.createHash('sha256').update(normalizza(email)).digest('hex');
}

// "mariorossi@gmail.com" → "ma***si@gmail.com". Deve bastare a riconoscere
// un indirizzo che si conosce già, non a ricostruirne uno che non si conosce.
function maschera(email) {
  const e = normalizza(email);
  const chiocciola = e.lastIndexOf('@');
  if (chiocciola < 1) return '***';
  const nome = e.slice(0, chiocciola);
  const dominio = e.slice(chiocciola);
  if (nome.length <= 4) return nome.slice(0, 1) + '***' + dominio;
  return nome.slice(0, 2) + '***' + nome.slice(-2) + dominio;
}

// Blocca. Idempotente: bloccare due volte la stessa email non è un errore
// e non crea una seconda riga (l'indice UNIQUE la respingerebbe comunque,
// ma un'eccezione qui farebbe fallire la cancellazione dell'account).
function blocca(email, { nickname, motivo, da } = {}) {
  const e = normalizza(email);
  if (!e || !e.includes('@')) return false;
  db.prepare(`INSERT INTO email_bloccate (impronta, mascherata, nickname, motivo, bloccata_da)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(impronta) DO NOTHING`)
    .run(impronta(e), maschera(e), nickname || null, motivo || null, da || null);
  return true;
}

function bloccata(email) {
  const e = normalizza(email);
  if (!e) return false;
  return !!db.prepare('SELECT 1 FROM email_bloccate WHERE impronta = ?').get(impronta(e));
}

function sblocca(id) {
  return db.prepare('DELETE FROM email_bloccate WHERE id = ?').run(id).changes > 0;
}

function elenco() {
  return db.prepare('SELECT id, mascherata, nickname, motivo, bloccata_da, created_at FROM email_bloccate ORDER BY id DESC').all();
}

module.exports = { blocca, bloccata, sblocca, elenco, maschera, normalizza };
