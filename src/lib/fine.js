// ===================================================================
// FantaSanRocco — I GIOCHI SONO FINITI
// -------------------------------------------------------------------
// Alle 20:00 del 19 agosto il gioco chiude. Da quel momento il sito resta
// in piedi ma diventa una cosa sola: la CLASSIFICA, con scritto che è
// finita. Missioni, mini-giochi, slot, ruota e sfide non accettano più
// niente — se restassero aperti anche cinque minuti, chi gioca alle 20:03
// scavalcherebbe chi ha smesso alle 20:00, e la classifica finale non
// sarebbe più difendibile davanti a nessuno.
//
// È lo stesso schema di lib/modalita.js (la settimana di sole iscrizioni):
// un INTERRUTTORE, non un travaso di dati. Non cancella e non archivia
// niente. Se domani si volesse riaprire per un supplemento, basta spegnerlo
// e tutto torna esattamente com'era, punti compresi.
//
// L'ORA E L'INTERRUTTORE
// Si accende DA SOLA all'ora scritta qui sotto: nessuno deve stare davanti
// al computer alle otto di sera dell'ultimo giorno di festa. Ma c'è anche la
// levetta nel pannello, perché la realtà slitta: se i fuochi vanno lunghi si
// rimanda, se finisce prima si chiude prima. La levetta VINCE sull'orologio
// — una volta toccata, comanda lei, in tutte e due le direzioni.
// ===================================================================
const { db } = require('../db');

const CHIAVE = 'giochi_finiti';

// L'ora della fine, in un posto solo. Porta il fuso italiano di proposito:
// senza, il server (che gira in UTC) chiuderebbe con due ore di ritardo.
const FINE_GIOCHI = {
  iso: '2026-08-19T20:00:00+02:00',
  etichetta: '19 agosto alle 20:00',
};
const _quando = new Date(FINE_GIOCHI.iso).getTime();

// Quello che resta aperto. Il criterio: si guarda, non si gioca.
// Resta APERTO tutto ciò che è di sola lettura — la classifica prima di
// tutto, poi le foto, il proprio profilo, i premi, il programma, la storia.
// Resta CHIUSO tutto ciò che può muovere un punto: missioni, giochi, slot,
// ruota, sfide, codici premio. È la stessa riga di confine della settimana
// di sole iscrizioni, solo tirata dall'altra parte.
const PERMESSE = new Set([
  '/',
  '/classifica',
  '/premio',                 // il primo posto dove corre chi ha vinto
  '/galleria',
  '/programmazione',
  '/storia',
  '/palio',                  // il pronostico è chiuso, il risultato si guarda
  '/profilo',
  '/storie',
  '/login', '/logout', '/login/2fa', '/2fa', '/2fa/attiva', '/2fa/disattiva',
  '/registrati',             // iscriversi ora non fa punti, ma non fa danno
  '/password-dimenticata',
  '/privacy', '/termini', '/health', '/segnalazioni',
]);

const PREFISSI = [
  '/profilo/',
  '/reset-password/',
  '/avatar/',
  '/uploads/',               // senza questo la galleria resta senza foto
  '/api/online',
  '/api/push/',
  '/storie/',
  '/api/storie/',
];

function consentito(percorso) {
  if (PERMESSE.has(percorso)) return true;
  return PREFISSI.some((p) => percorso.startsWith(p));
}

// La levetta sta nel database (deve sopravvivere a un riavvio) ma il valore
// si tiene in memoria: questo controllo gira a ogni richiesta.
//
// Si tiene in cache SOLO la levetta, mai il risultato finale: il risultato
// dipende dall'orologio, e una risposta "non ancora" messa in cache alle
// 19:59 resterebbe "non ancora" per sempre. Il confronto fra due numeri non
// costa niente, la lettura dal database sì: per questo sono separati.
let _levetta;                                  // undefined = mai letta
function _leggiLevetta() {
  if (_levetta === undefined) {
    const r = db.prepare('SELECT valore FROM impostazioni WHERE chiave = ?').get(CHIAVE);
    _levetta = r ? r.valore : null;            // null = mai toccata, decide l'orologio
  }
  return _levetta;
}

function attiva() {
  const l = _leggiLevetta();
  if (l === '1') return true;                  // chiusa a mano, prima dell'ora
  if (l === '0') return false;                 // riaperta a mano, dopo l'ora
  return Date.now() >= _quando;                // nessuno ha toccato niente: comanda l'orologio
}

function imposta(finita) {
  db.prepare(`INSERT INTO impostazioni (chiave, valore, aggiornato_il)
              VALUES (?, ?, datetime('now'))
              ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore, aggiornato_il = excluded.aggiornato_il`)
    .run(CHIAVE, finita ? '1' : '0');
  _levetta = finita ? '1' : '0';
  return attiva();
}

// Torna a lasciar decidere l'orologio. Serve se uno tocca la levetta per
// sbaglio: senza, l'unico modo di annullare sarebbe rimetterla nella
// posizione che l'orologio avrebbe scelto, indovinando quale sia.
function automatico() {
  db.prepare('DELETE FROM impostazioni WHERE chiave = ?').run(CHIAVE);
  _levetta = null;
  return attiva();
}

function quando() {
  const r = db.prepare('SELECT aggiornato_il FROM impostazioni WHERE chiave = ?').get(CHIAVE);
  return r ? r.aggiornato_il : null;
}

module.exports = { attiva, imposta, automatico, quando, consentito, FINE_GIOCHI, PERMESSE, PREFISSI };
