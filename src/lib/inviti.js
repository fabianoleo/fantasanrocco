// ===================================================================
// FantaSanRocco — INVITI
// -------------------------------------------------------------------
// Ogni giocatore ha UN codice, sempre lo stesso, che può girare a
// quanti amici vuole. Chi si iscrive lo scrive nel form (o arriva dal
// link, che lo compila da solo), e da quel momento i due sono collegati.
//
// I punti però NON arrivano lì. Arrivano quando l'amico raggiunge la
// soglia (350 punti), ed è tutto il senso della cosa: pagare
// all'iscrizione voleva dire pagare chi si fabbricava gli account, e
// riconoscerli dopo era una caccia. A 350 punti un account finto non ci
// arriva — bisogna giocare davvero.
//
// Il prezzo di questa scelta è che il pagamento non coincide più con un
// evento che accade una volta sola per costruzione: serve il segno
// `invito_pagato`, e ogni strada che tocca i punti deve passare da
// verificaSoglia. Chi usa il proprio codice invece resta impossibile per
// conto suo: chi si iscrive non ha ancora un account, quindi non ha
// ancora un codice.
//
// Il codice NON è usa-e-getta come la vecchia tabella `invites` (tolta
// quando le iscrizioni sono diventate libere): quella serviva a
// sbarrare la porta, questo serve solo a dire "questo amico l'ho
// portato io". Sbarrare non serve più, contare sì.
// ===================================================================
const { db } = require('../db');
const punti = require('./punti');
// Il punteggio vero di una persona: missioni approvate PIÙ points_adjust.
// La soglia si misura su quello, non sul solo saldo, o le missioni — che
// sono il cuore del gioco — non conterebbero.
const { userPoints } = require('./classifica');

// Quanto vale portare un amico, e quanto deve giocare l'amico perché valga.
//
// La soglia è tutto il senso della cosa: senza, bastava fabbricare account
// per fare punti, e cancellarli a posteriori era una caccia. A 350 punti un
// account finto non ci arriva — bisogna giocare davvero — quindi il problema
// si sposta da "riconoscere i furbi dopo" a "non pagarli mai".
const PUNTI_INVITO = 10;
const SOGLIA_INVITO = 350;

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

// Il collegamento fra chi invita e chi si è iscritto. Qui NON si paga
// niente: all'iscrizione si sa solo che quella persona è arrivata col
// codice di un'altra. I punti arrivano dopo, se e quando gioca davvero
// (vedi verificaSoglia).
function collega(nuovoId, invitanteId) {
  db.prepare("UPDATE users SET invited_by = ?, invited_at = datetime('now') WHERE id = ?")
    .run(invitanteId, nuovoId);
}

// Il premio, quando l'invitato arriva alla soglia. Si chiama a ogni
// movimento di punti (vedi lib/punti.js) e a ogni prova approvata: sono i
// due soli modi in cui un punteggio cresce.
//
// Torna 0 quasi sempre, ed è la ragione per cui può stare su quella strada:
// due letture su una riga sola, e si ferma alla prima condizione che manca.
//
// Una volta pagato resta pagato, anche se poi il punteggio ridiscende sotto
// i 350 (uno storno, una prova annullata): la soglia dice "questa persona
// ha giocato davvero", ed è un fatto avvenuto, non uno stato.
function verificaSoglia(utenteId) {
  const u = db.prepare('SELECT id, nickname, invited_by, invito_pagato FROM users WHERE id = ?').get(utenteId);
  if (!u || !u.invited_by || u.invito_pagato) return 0;
  if (userPoints(u.id) < SOGLIA_INVITO) return 0;

  // Il segno va messo PRIMA di pagare. muovi() richiama questa stessa
  // funzione per chi incassa — che potrebbe essere a sua volta un invitato
  // vicino alla soglia — e senza il segno già scritto si rientrerebbe qui
  // sullo stesso utente.
  db.prepare('UPDATE users SET invito_pagato = 1 WHERE id = ?').run(u.id);
  punti.muovi(u.invited_by, PUNTI_INVITO, 'invito',
    `${u.nickname} ha raggiunto ${SOGLIA_INVITO} punti`, u.id);

  // L'avviso esce dalla transazione in corso: setImmediate lo rimanda al giro
  // dopo, quando il commit è già passato. Dentro terrebbe aperto il lock di
  // scrittura per tutta la durata di una chiamata di rete.
  setImmediate(() => avvisaTraguardo(u.invited_by, u.nickname));
  return PUNTI_INVITO;
}

// Disfa il premio quando l'account invitato viene cancellato. Va chiamata
// PRIMA del DELETE, dentro la stessa transazione: dopo, il riferimento è
// già stato azzerato dal vincolo e non c'è più niente da ritrovare.
//
// Toglie ESATTAMENTE quello che aveva dato, non i PUNTI_INVITO di oggi: se
// il premio un domani cambia, un invito vecchio va disfatto per quanto
// valeva al suo tempo, altrimenti cancellare un account regalerebbe o
// ruberebbe punti a chi non c'entra.
//
// Lo storno è un movimento 'invito' NEGATIVO e non un 'storno' generico:
// così la classifica degli inviti nel pannello — che somma i movimenti
// 'invito' — si corregge da sola man mano che si ripulisce, invece di
// continuare a mostrare i punti di account che non esistono più.
// Si ragiona sul NETTO — pagamenti meno storni già fatti — e non riga per
// riga. Uno stesso invito può ormai essere pagato, disfatto e ripagato:
// pagato, poi tolto perché l'amico era sotto soglia, poi ripagato quando la
// soglia l'ha raggiunta. Riga per riga si sarebbero stornati due pagamenti
// invece di uno, e la penalità sarebbe stata doppia. Sul netto il conto
// torna in tutti i casi, compreso quello in cui non c'è niente da togliere.
//
// Lo storno porta il riferimento all'invitato come il pagamento: è quello
// che permette di sommarli insieme la volta dopo.
function storna(invitatoId, nicknameInvitato, motivo) {
  const conRif = db.prepare(`
    SELECT user_id, SUM(delta) AS netto FROM punti_movimenti
    WHERE causa = 'invito' AND rif_user_id = ? GROUP BY user_id
  `).all(invitatoId);

  // Gli inviti pagati prima che esistesse rif_user_id non hanno riferimento:
  // lì l'unico appiglio è il testo del dettaglio, che lo scriveva la vecchia
  // regola — quando il bonus si pagava all'iscrizione — e nessun altro.
  const daStornare = conRif.length ? conRif : db.prepare(`
    SELECT m.user_id, SUM(m.delta) AS netto FROM punti_movimenti m
    JOIN users u ON u.id = ?
    WHERE m.causa = 'invito' AND m.rif_user_id IS NULL
      AND m.user_id = u.invited_by AND m.dettaglio = ?
    GROUP BY m.user_id
  `).all(invitatoId, `Iscrizione di ${nicknameInvitato}`);

  let tolti = 0;
  for (const r of daStornare) {
    if (r.netto <= 0) continue;
    punti.muovi(r.user_id, -r.netto, 'invito',
      motivo || `Invito annullato: account di ${nicknameInvitato} eliminato`, invitatoId);
    tolti += r.netto;
  }
  return tolti;
}

// Riporta i vecchi pagamenti sotto la regola nuova: chi ha incassato per un
// amico che non è (ancora) arrivato a 350 punti se li vede togliere.
//
// `invito_pagato` torna a 0, non resta segnato: non è una punizione ma un
// rinvio: se quell'amico un giorno i 350 punti li fa, il bonus riparte da
// solo — ed è per questo che la notifica lo dice, altrimenti sembrerebbe
// una porta chiusa.
//
// Torna un elenco per invitante, così chi chiama manda UN avviso a testa
// invece di uno per ogni amico: tre notifiche di fila per la stessa cosa
// sarebbero tre volte la stessa brutta notizia.
function allineaAllaSoglia() {
  const candidati = db.prepare(`
    SELECT id, nickname, invited_by FROM users
    WHERE invited_by IS NOT NULL AND invito_pagato = 1
  `).all();

  const perInvitante = new Map();
  db.transaction(() => {
    for (const a of candidati) {
      if (userPoints(a.id) >= SOGLIA_INVITO) continue;
      const tolti = storna(a.id, a.nickname,
        `${a.nickname} non ha ancora raggiunto ${SOGLIA_INVITO} punti`);
      if (!tolti) continue;
      db.prepare('UPDATE users SET invito_pagato = 0 WHERE id = ?').run(a.id);
      const acc = perInvitante.get(a.invited_by) || { invitanteId: a.invited_by, quanti: 0, punti: 0 };
      acc.quanti++; acc.punti += tolti;
      perInvitante.set(a.invited_by, acc);
    }
  })();

  return [...perInvitante.values()];
}

// L'avviso di quei punti tolti. Dice anche che si riprendono, perché è vero
// e perché senza sembrerebbe una punizione invece di un rinvio.
function avvisaAllineamento({ invitanteId, quanti, punti: tolti }) {
  const { pushToUser } = require('./notifiche');
  return pushToUser(invitanteId, {
    title: `−${tolti} punti dagli inviti`,
    body: `${quanti === 1 ? 'Un amico che hai invitato non è' : `${quanti} amici che hai invitato non sono`} `
        + `ancora ${quanti === 1 ? 'arrivato' : 'arrivati'} a ${SOGLIA_INVITO} punti: ora il bonus si prende solo lì. `
        + `Li riprendi appena ci ${quanti === 1 ? 'arriva' : 'arrivano'}.`,
    url: '/profilo',
  }).catch((e) => console.error('[INVITO] push allineamento', e.message));
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
  return pushToUser(invitanteId, {
    title: '🎉 Un amico si è iscritto!',
    body: `${nicknameNuovo} si è iscritto col tuo codice. `
        + `Prendi +${PUNTI_INVITO} punti quando arriva a ${SOGLIA_INVITO}.`,
    url: '/profilo',
  }).catch((e) => console.error('[INVITO] push', e.message));
}

// Il secondo avviso: quello che dice che i punti sono arrivati davvero.
// Sono due momenti diversi e vanno detti tutti e due — chi invita ha visto
// l'amico iscriversi giorni prima, e senza questo non saprebbe mai che il
// bonus è scattato.
function avvisaTraguardo(invitanteId, nicknameInvitato) {
  const { pushToUser } = require('./notifiche');
  const { quanti } = riepilogo(invitanteId);
  return pushToUser(invitanteId, {
    title: `⭐ +${PUNTI_INVITO} punti dal tuo invito!`,
    body: `${nicknameInvitato} ha raggiunto ${SOGLIA_INVITO} punti. `
        + (quanti === 1 ? 'È il primo amico che ti frutta punti.' : `Amici che ti hanno fruttato punti: ${quanti}.`),
    url: '/profilo',
  }).catch((e) => console.error('[INVITO] push traguardo', e.message));
}

// Quanti ne ha portati e quanto ci ha guadagnato. I punti si ricalcolano
// dal conteggio invece di rileggerli dal registro: se un domani il premio
// cambia, i vecchi inviti restano pagati com'erano al loro tempo — quindi
// il numero giusto da mostrare è quello del registro, non una moltiplicazione.
function riepilogo(userId) {
  // Due numeri diversi da quando c'è la soglia: quanti ne ha portati in tutto
  // e quanti hanno gia' fruttato. La differenza sono quelli che devono ancora
  // arrivare a 350, e va mostrata: senza, chi ha invitato cinque amici e non
  // vede punti crede che il meccanismo sia rotto.
  const portati = db.prepare('SELECT COUNT(*) c FROM users WHERE invited_by = ?').get(userId).c;
  const quanti = db.prepare('SELECT COUNT(*) c FROM users WHERE invited_by = ? AND invito_pagato = 1').get(userId).c;
  const guadagnati = db.prepare(
    "SELECT COALESCE(SUM(delta), 0) s FROM punti_movimenti WHERE user_id = ? AND causa = 'invito'"
  ).get(userId).s;
  return { portati, quanti, inAttesa: portati - quanti, guadagnati };
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
           SUM(a.invito_pagato) AS pagati,
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
    SELECT a.invited_by, a.id, a.nickname, a.invited_at, a.invito_pagato,
           a.points_adjust,
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
      pagato: !!a.invito_pagato,
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

module.exports = {
  PUNTI_INVITO, SOGLIA_INVITO,
  codicePer, invitante, collega, verificaSoglia, storna,
  allineaAllaSoglia, avvisaAllineamento,
  avvisa, riepilogo, classifica, normalizza,
};
