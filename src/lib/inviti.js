// ===================================================================
// FantaSanRocco — INVITI
// -------------------------------------------------------------------
// Ogni giocatore ha UN codice, sempre lo stesso, che può girare a
// quanti amici vuole. Chi si iscrive lo scrive nel form (o arriva dal
// link, che lo compila da solo) e in quel momento — e solo in quel
// momento — chi ha invitato incassa i punti.
//
// Il premio si paga alla NASCITA dell'account, mai dopo. È questo che
// rende impossibile pagarlo due volte per la stessa persona: non c'è
// un secondo momento in cui possa succedere. Per la stessa ragione non
// serve controllare che nessuno usi il proprio codice — chi si iscrive
// non ha ancora un account, quindi non ha ancora un codice.
//
// Il codice NON è usa-e-getta come la vecchia tabella `invites` (tolta
// quando le iscrizioni sono diventate libere): quella serviva a
// sbarrare la porta, questo serve solo a dire "questo amico l'ho
// portato io". Sbarrare non serve più, contare sì.
// ===================================================================
const { db } = require('../db');
const punti = require('./punti');

// Quanto vale portare un amico.
const PUNTI_INVITO = 10;

// Niente 0/O, 1/I/L: il codice si detta a voce e si copia a mano da uno
// schermo di telefono, e quelle coppie si sbagliano sempre.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LUNGHEZZA = 6;

const crypto = require('crypto');

function sorteggia() {
  // randomInt e non Math.random: il codice finisce in un link pubblico e
  // indovinarne uno altrui vorrebbe dire regalargli punti.
  let s = '';
  for (let i = 0; i < LUNGHEZZA; i++) s += ALFABETO[crypto.randomInt(ALFABETO.length)];
  return s;
}

// Come arriva scritto dall'utente e come sta nel database sono due cose
// diverse: chi lo copia si porta dietro spazi, trattini e minuscole.
function normalizza(grezzo) {
  return String(grezzo || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
}

// Il codice di una persona. Se non ce l'ha ancora glielo si dà adesso:
// così gli account nati prima degli inviti non hanno bisogno di nessuna
// migrazione, e chi non apre mai la pagina non occupa un codice.
function codicePer(userId) {
  const u = db.prepare('SELECT invite_code FROM users WHERE id = ?').get(userId);
  if (!u) return null;
  if (u.invite_code) return u.invite_code;

  // Le collisioni sono rarissime (31^6 ≈ 887 milioni) ma non impossibili:
  // l'indice UNIQUE le respinge e si riprova, invece di dare a due persone
  // lo stesso codice e far litigare gli amici sui punti.
  for (let tentativo = 0; tentativo < 12; tentativo++) {
    const codice = sorteggia();
    try {
      db.prepare('UPDATE users SET invite_code = ? WHERE id = ? AND invite_code IS NULL')
        .run(codice, userId);
      const dopo = db.prepare('SELECT invite_code FROM users WHERE id = ?').get(userId);
      if (dopo && dopo.invite_code) return dopo.invite_code;
    } catch (_) { /* collisione: si riprova con un altro sorteggio */ }
  }
  return null;
}

// Da codice scritto a mano a persona che l'ha messo in giro. Torna null se
// il codice non esiste: chi si iscrive va avvisato, non lasciato credere di
// aver fatto un regalo che non è arrivato.
function invitante(grezzo) {
  const codice = normalizza(grezzo);
  if (!codice) return null;
  return db.prepare('SELECT id, nickname FROM users WHERE invite_code = ? COLLATE NOCASE').get(codice) || null;
}

// Il premio. Va chiamata DENTRO la transazione che crea l'account: o
// nascono insieme l'iscritto e i punti di chi l'ha portato, o non nasce
// niente. Un amico iscritto senza il suo bonus sarebbe irrecuperabile —
// nessuno se ne accorgerebbe mai.
function premia(nuovoId, invitanteId, nicknameNuovo) {
  db.prepare("UPDATE users SET invited_by = ?, invited_at = datetime('now') WHERE id = ?")
    .run(invitanteId, nuovoId);
  punti.muovi(invitanteId, PUNTI_INVITO, 'invito', `Iscrizione di ${nicknameNuovo}`);
}

// L'avviso a chi ha invitato. Va chiamata DOPO che la transazione ha
// chiuso, mai dentro: un invio di rete dentro una transazione tiene il
// lock di scrittura aperto per tutta la durata della chiamata.
//
// Non aspetta e non puo' far cadere l'iscrizione: se la push fallisce
// l'amico si e' iscritto lo stesso e i punti sono gia' pagati. E se le
// chiavi VAPID non ci sono, pushToUser non fa niente e non e' un errore.
//
// Senza questo avviso l'invitante non sapeva niente: il bonus compariva
// nel profilo e basta, e chi non andava a guardare non scopriva mai che
// l'amico si era iscritto davvero.
function avvisa(invitanteId, nicknameNuovo) {
  const { pushToUser } = require('./notifiche');
  const { quanti } = riepilogo(invitanteId);
  return pushToUser(invitanteId, {
    title: '🎉 Un amico si è iscritto!',
    body: `${nicknameNuovo} si è iscritto col tuo codice — +${PUNTI_INVITO} punti. `
        + (quanti === 1 ? 'È il primo che porti.' : `Ne hai portati ${quanti}.`),
    url: '/profilo',
  }).catch((e) => console.error('[INVITO] push', e.message));
}

// Quanti ne ha portati e quanto ci ha guadagnato. I punti si ricalcolano
// dal conteggio invece di rileggerli dal registro: se un domani il premio
// cambia, i vecchi inviti restano pagati com'erano al loro tempo — quindi
// il numero giusto da mostrare è quello del registro, non una moltiplicazione.
function riepilogo(userId) {
  const quanti = db.prepare('SELECT COUNT(*) c FROM users WHERE invited_by = ?').get(userId).c;
  const guadagnati = db.prepare(
    "SELECT COALESCE(SUM(delta), 0) s FROM punti_movimenti WHERE user_id = ? AND causa = 'invito'"
  ).get(userId).s;
  return { quanti, guadagnati };
}

// Chi ha guadagnato di più portando amici, e CHI ha portato. Serve a una
// cosa sola: accorgersi di chi si fabbrica gli amici da solo.
//
// Il numero da guardare non è quanti ne ha portati — chi ha tanti amici veri
// ne porta tanti — ma quanti di quelli non hanno MAI giocato. Un account
// creato per regalare 10 punti a chi l'ha creato non gira la Ruota, non manda
// prove e resta a zero: e' quella la firma, e per vederla bisogna avere
// l'elenco davanti, non un totale.
//
// L'ora di iscrizione c'e' per la stessa ragione: dieci amici arrivati nello
// stesso minuto sono una cosa diversa da dieci arrivati in tre giorni.
function classifica(limite = 20) {
  const righe = db.prepare(`
    SELECT u.id, u.nickname, u.role,
           COUNT(a.id) AS quanti,
           COALESCE((SELECT SUM(delta) FROM punti_movimenti
                     WHERE user_id = u.id AND causa = 'invito'), 0) AS punti
    FROM users u
    JOIN users a ON a.invited_by = u.id
    GROUP BY u.id
    ORDER BY punti DESC, quanti DESC, u.nickname
    LIMIT ?
  `).all(limite);
  if (!righe.length) return [];

  // Un'unica lettura per tutti gli invitati, non una per invitante.
  const ids = righe.map((r) => r.id);
  const segnaposti = ids.map(() => '?').join(',');
  const invitati = db.prepare(`
    SELECT a.invited_by, a.id, a.nickname, a.invited_at, a.points_adjust,
           (SELECT COUNT(*) FROM submissions WHERE user_id = a.id) AS prove
    FROM users a
    WHERE a.invited_by IN (${segnaposti})
    ORDER BY a.invited_at, a.id
  `).all(...ids);

  const perInvitante = new Map(righe.map((r) => [r.id, []]));
  for (const a of invitati) {
    // "Mai giocato": nessuna prova inviata e saldo intatto. Non prova la
    // truffa da sola — uno puo' essersi iscritto e non aver ancora fatto
    // niente — ma cinque cosi' di fila da uno stesso invitante sono
    // un'altra cosa.
    perInvitante.get(a.invited_by).push({
      id: a.id,
      nickname: a.nickname,
      quando: a.invited_at,
      maiGiocato: a.prove === 0 && a.points_adjust === 0,
    });
  }

  return righe.map((r) => {
    const elenco = perInvitante.get(r.id) || [];
    return {
      ...r,
      invitati: elenco,
      maiGiocatoQuanti: elenco.filter((a) => a.maiGiocato).length,
    };
  });
}

module.exports = { PUNTI_INVITO, codicePer, invitante, premia, avvisa, riepilogo, classifica, normalizza };
