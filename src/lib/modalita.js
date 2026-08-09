// ===================================================================
// FantaSanRocco — MODALITÀ SOLO ISCRIZIONI
// -------------------------------------------------------------------
// La settimana fra l'apertura delle iscrizioni e l'inizio della festa
// l'app è aperta ma quasi tutta ferma: ci si iscrive, si guarda il
// programma, si gira la Ruota e si prende il bonus del giorno. Missioni,
// mini-giochi e slot restano chiusi finché non comincia davvero.
//
// È un INTERRUTTORE, non un travaso di dati: accendere e spegnere non
// tocca punti, iscritti o classifica. Chi si iscrive stanotte e gira la
// Ruota per sette giorni, quando si apre tutto si ritrova esattamente i
// punti che aveva. Era la richiesta principale ed è anche il motivo per
// cui la modalità NON è fatta archiviando le missioni: quella strada
// avrebbe cancellato le prove già inviate.
//
// Lo staff non è mai bloccato: deve poter preparare e controllare le
// pagine chiuse mentre i giocatori vedono solo quelle aperte.
// ===================================================================
const { db } = require('../db');

const CHIAVE = 'solo_iscrizioni';

// QUANDO COMINCIA IL GIOCO. Sta qui, in un posto solo, perché la stessa data
// la dicono la home (conto alla rovescia e avviso), la pagina di attesa, il
// messaggio JSON delle chiamate respinte e la colonna "scattata prima della
// festa" dell'export. Era scritta a mano in cinque punti: spostarla di due
// giorni voleva dire cinque modifiche, e bastava dimenticarne una perché
// l'app dicesse due date diverse nella stessa schermata.
//
// `iso` porta il fuso italiano di proposito: senza, un browser a ovest di
// Greenwich vedrebbe il conto alla rovescia sfasato di un giorno.
const INIZIO_GIOCO = {
  data: '2026-08-12',
  etichetta: '12 agosto',
  iso: '2026-08-12T00:00:00+02:00',
};

// Le pagine che restano aperte. In fondo alla lista il criterio, che serve
// a decidere i casi nuovi senza riaprire la discussione ogni volta.
//
// ESATTE: il confronto è sul percorso intero.
const PERMESSE = new Set([
  '/',                       // la porta d'ingresso: da qui ci si iscrive
  '/classifica',
  '/programmazione',
  '/palio',
  '/galleria',
  '/storia',
  '/profilo',
  '/ruota',                  // uno dei due soli modi di fare punti in questa settimana
  '/ruota/gira',
  '/missioni/pronostico',    // il pronostico del Palio: sta in /palio, non fra le missioni
  '/api/streak/claim',       // l'altro: il bonus giornaliero
  // Le storie. La barra sta nel layout, quindi si vede su OGNI pagina aperta:
  // tenendole chiuse si vedeva l'invito a pubblicare e il caricamento falliva
  // con un errore che parlava del 12 agosto. E non danno punti, quindi non
  // toccano il criterio qui sotto: la settimana resta spiegabile.
  '/storie',
  // Entrare, uscire, recuperare la password: senza queste la settimana
  // delle iscrizioni non avrebbe senso.
  '/registrati', '/login', '/logout', '/login/2fa', '/2fa', '/2fa/attiva', '/2fa/disattiva',
  '/password-dimenticata',
  // Pagine di servizio e obblighi di legge.
  '/privacy', '/termini', '/health', '/segnalazioni',
]);

// PREFISSI: tutto quello che comincia così. Servono per le rotte con un
// pezzo variabile dentro (un token, un nome di file).
const PREFISSI = [
  '/profilo/',               // cambio password, avatar, eliminazione account
  '/reset-password/',
  '/avatar/',
  '/api/online',
  '/api/push/',
  // Foto delle storie, eliminazione e segnalazione: senza queste la barra si
  // aprirebbe ma le storie non si vedrebbero, e non si potrebbe ne' togliere
  // la propria ne' segnalare quella di un altro.
  '/storie/',
  '/api/storie/',
];

// Il criterio, per i casi che verranno: resta aperto ciò che serve a
// ISCRIVERSI, a INFORMARSI sulla festa, a FARSI VEDERE (le storie: non
// danno punti, e una settimana di sole iscrizioni senza niente da guardare
// è una settimana in cui nessuno riapre l'app), e i modi di fare punti
// decisi per questa settimana. Resta chiuso tutto ciò che dà punti in altri modi —
// missioni, mini-giochi, slot, sfide, codici premio — perché a settembre la
// classifica deve essere spiegabile: in questa settimana i punti potevano
// arrivare solo da tre posti, e sono la Ruota, il bonus giornaliero e gli
// amici invitati. Gli inviti sono nati apposta per questa settimana: è
// quando serve che la gente si iscriva, e /registrati è aperto comunque.
function consentito(percorso) {
  if (PERMESSE.has(percorso)) return true;
  return PREFISSI.some((p) => percorso.startsWith(p));
}

// Il valore sta nel database (deve sopravvivere a un riavvio: se si
// spegnesse da solo alla prima ricreazione del container, l'app si
// aprirebbe tutta nel momento peggiore) ma viene tenuto in memoria: questo
// controllo gira a OGNI richiesta, comprese immagini e fogli di stile.
let _cache = null;
function attiva() {
  if (_cache === null) {
    const r = db.prepare('SELECT valore FROM impostazioni WHERE chiave = ?').get(CHIAVE);
    _cache = r ? r.valore === '1' : false;
  }
  return _cache;
}

function imposta(accesa) {
  db.prepare(`INSERT INTO impostazioni (chiave, valore, aggiornato_il)
              VALUES (?, ?, datetime('now'))
              ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore, aggiornato_il = excluded.aggiornato_il`)
    .run(CHIAVE, accesa ? '1' : '0');
  _cache = !!accesa;
  return _cache;
}

// Da quando è accesa (o spenta) l'ultima volta: nel pannello serve a
// sapere se l'interruttore è stato toccato davvero, e quando.
function quando() {
  const r = db.prepare('SELECT aggiornato_il FROM impostazioni WHERE chiave = ?').get(CHIAVE);
  return r ? r.aggiornato_il : null;
}

module.exports = { attiva, imposta, quando, consentito, INIZIO_GIOCO, PERMESSE, PREFISSI };
