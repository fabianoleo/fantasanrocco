// ===================================================================
// FantaSanRocco — SFIDE FRA AMICI
// -------------------------------------------------------------------
// Un duello a due su un mini-gioco: chi lancia mette il punteggio che ha
// appena fatto, chi riceve ha UNA partita per batterlo.
//
// Sta FUORI dalla classifica e non dà punti né stelle. Non è una
// dimenticanza: legare una sfida ai punti significa farsi le sfide da
// soli con un secondo account, e il gioco vero è la classifica.
//
// Il punteggio dello sfidante è una COPIA presa al momento del lancio,
// non un riferimento alla partita: se poi migliora il record, la sfida
// gia' lanciata resta quella che era.
// ===================================================================
const crypto = require('crypto');
const { db } = require('../db');

const GIOCHI = {
  runner:  { nome: 'Corri San Rocco',  unita: 'punti', url: '/giochi?g=runner' },
  jetpack: { nome: 'San Rocco Jetpack', unita: 'metri', url: '/giochi?g=jetpack' },
};

// Quanto vive una sfida. Cinque giorni = la durata della festa: una sfida
// lanciata il 14 ha senso fino alla fine, una di tre settimane fa no.
const GIORNI_VALIDA = 5;

function giocoValido(g) { return Object.prototype.hasOwnProperty.call(GIOCHI, g); }

// Chi si vuole sfidare si scrive come viene: nickname o email. Si cerca in
// tutti e due i modi perché chi invita non sa (e non deve sapere) con quale
// dei due l'altro si è iscritto.
function trovaDestinatario(testo) {
  const t = String(testo || '').trim();
  if (!t) return null;
  return db.prepare(
    'SELECT id, nickname, email FROM users WHERE nickname = ? COLLATE NOCASE OR lower(email) = lower(?) LIMIT 1'
  ).get(t, t) || null;
}

function pareEmail(testo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(testo || '').trim());
}

// L'ultimo punteggio VERO di quella persona su quel gioco. Si prende dal
// registro delle partite e non da quello che manda il browser: il punteggio
// della sfida non deve poter essere scritto a mano nella richiesta.
function ultimoPunteggio(userId, gioco) {
  const r = db.prepare(
    'SELECT score FROM game_runs WHERE user_id = ? AND game = ? ORDER BY id DESC LIMIT 1'
  ).get(userId, gioco);
  return r ? r.score : null;
}

function crea({ sfidanteId, gioco, punteggio, destinatario }) {
  const token = crypto.randomBytes(16).toString('hex');
  const u = trovaDestinatario(destinatario);
  const scade = new Date(Date.now() + GIORNI_VALIDA * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const info = db.prepare(`
    INSERT INTO sfide (token, gioco, sfidante_id, punteggio_sfidante, sfidato_id, sfidato_email, sfidato_nome, scade_il)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    token, gioco, sfidanteId, punteggio,
    u ? u.id : null,
    u ? (u.email || null) : (pareEmail(destinatario) ? String(destinatario).trim() : null),
    String(destinatario || '').trim().slice(0, 60),
    scade,
  );
  return { id: info.lastInsertRowid, token, destinatario: u };
}

function perToken(token) {
  return db.prepare(`
    SELECT s.*, u.nickname AS sfidante_nome, u.avatar_path AS sfidante_avatar,
           v.nickname AS sfidato_nickname
    FROM sfide s
    JOIN users u ON u.id = s.sfidante_id
    LEFT JOIN users v ON v.id = s.sfidato_id
    WHERE s.token = ?
  `).get(String(token || ''));
}

function scaduta(s) {
  return !!s && new Date(s.scade_il.replace(' ', 'T') + 'Z').getTime() < Date.now();
}

// Chi apre il link viene agganciato alla sfida. Serve per l'invito per email
// a chi non era ancora iscritto: al primo accesso la sfida diventa sua.
function agganciaSfidato(sfidaId, userId) {
  db.prepare('UPDATE sfide SET sfidato_id = ? WHERE id = ? AND sfidato_id IS NULL').run(userId, sfidaId);
}

// Le sfide che aspettano una partita da questa persona.
function inAttesaPer(userId) {
  return db.prepare(`
    SELECT s.*, u.nickname AS sfidante_nome
    FROM sfide s JOIN users u ON u.id = s.sfidante_id
    WHERE s.sfidato_id = ? AND s.stato = 'aperta' AND s.scade_il > datetime('now')
    ORDER BY s.created_at DESC
  `).all(userId);
}

// Le sfide lanciate da questa persona e già giocate, che non ha ancora visto.
function lanciateDa(userId) {
  return db.prepare(`
    SELECT s.*, v.nickname AS sfidato_nickname
    FROM sfide s LEFT JOIN users v ON v.id = s.sfidato_id
    WHERE s.sfidante_id = ? AND s.scade_il > datetime('now')
    ORDER BY s.created_at DESC LIMIT 10
  `).all(userId);
}

// Chiude i duelli aperti di questa persona su questo gioco con il punteggio
// appena fatto. Ne chiude UNO solo — il più vecchio — perché una partita
// vale una sfida: altrimenti con una partita fortunata se ne vincerebbero
// cinque in un colpo.
// Torna la sfida chiusa (con l'esito) oppure null.
function chiudiConPartita(userId, gioco, punteggio) {
  const s = db.prepare(`
    SELECT s.*, u.nickname AS sfidante_nome
    FROM sfide s JOIN users u ON u.id = s.sfidante_id
    WHERE s.sfidato_id = ? AND s.gioco = ? AND s.stato = 'aperta' AND s.scade_il > datetime('now')
    ORDER BY s.created_at ASC LIMIT 1
  `).get(userId, gioco);
  if (!s) return null;
  db.prepare("UPDATE sfide SET punteggio_sfidato = ?, stato = 'giocata' WHERE id = ?").run(punteggio, s.id);
  return {
    ...s,
    punteggio_sfidato: punteggio,
    // A parità vince chi ha lanciato: chi sfida mette il punteggio per primo
    // e allo sfidato serve BATTERLO, non pareggiarlo.
    vinta: punteggio > s.punteggio_sfidante,
  };
}

module.exports = {
  GIOCHI, GIORNI_VALIDA, giocoValido, trovaDestinatario, pareEmail,
  ultimoPunteggio, crea, perToken, scaduta, agganciaSfidato,
  inAttesaPer, lanciateDa, chiudiConPartita,
};
