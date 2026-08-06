// ===================================================================
// FantaSanRocco — MOVIMENTI DI PUNTI
// -------------------------------------------------------------------
// Un punto solo da cui passano tutte le variazioni di points_adjust.
// Prima erano tredici UPDATE sparsi nel server: il saldo si muoveva e
// nessuno sapeva più perché. Davanti a un punteggio sospetto non c'era
// niente da guardare.
//
// muovi() fa due cose insieme: aggiorna il totale e scrive la riga nel
// registro. Se qualcuno aggiunge un nuovo modo di dare punti e NON passa
// di qui, quei punti non compariranno nello storico: è il motivo per cui
// conviene che questa resti l'unica strada.
//
// I punti delle MISSIONI non passano di qui e non è una dimenticanza:
// stanno già in submissions con foto, data e chi ha approvato, che è una
// tracciabilità migliore di una riga di registro. Lo storico li unisce.
// ===================================================================
const { db } = require('../db');

// Le cause, con l'etichetta che si legge nel pannello. Tenere l'elenco
// qui evita che nel registro finiscano dieci nomi diversi per la stessa
// cosa ("slot", "Slot", "slot-perdita"…).
const CAUSE = {
  ruota:        'Ruota della Fortuna',
  slot:         'Slot',
  striscia:     'Striscia giornaliera',
  sezione:      'Sezione completata',
  moderazione:  'Bonus dello staff',
  notifiche:    'Avvisi della festa',
  codice:       'Codice premio',
  admin:        'Assegnati a mano',
  pronostico:   'Pronostico',
  palio:        'Palio dei Fuochi',
  invito:       'Amici invitati',
  storno:       'Storno',
};

function etichetta(causa) { return CAUSE[causa] || causa; }

// Sposta il saldo e lascia la traccia. `delta` può essere negativo.
// Va chiamata DENTRO la transazione di chi la usa, quando ce n'è una:
// così o si muovono saldo e registro insieme, o non si muove niente.
//
// `rifUserId` è l'altra persona coinvolta, quando c'è: chi si è iscritto
// col mio codice, per esempio. Non serve a leggere il registro — quello lo
// racconta il dettaglio — ma a ritrovare un movimento preciso quando va
// disfatto, senza doverlo riconoscere dal testo.
function muovi(userId, delta, causa, dettaglio, rifUserId) {
  if (!userId || !Number.isFinite(delta) || delta === 0) return;
  db.prepare('UPDATE users SET points_adjust = points_adjust + ? WHERE id = ?').run(delta, userId);
  db.prepare('INSERT INTO punti_movimenti (user_id, delta, causa, dettaglio, rif_user_id) VALUES (?, ?, ?, ?, ?)')
    .run(userId, delta, causa, dettaglio || null, rifUserId || null);
}

// Lo storico completo di una persona: i movimenti del registro PIÙ le
// missioni approvate, mescolati in ordine di tempo. Sono due sorgenti
// diverse perché i punti delle missioni non stanno in points_adjust.
function storico(userId, limite) {
  const mov = db.prepare(`
    SELECT id, created_at AS quando, delta, causa, dettaglio
    FROM punti_movimenti WHERE user_id = ?
  `).all(userId).map((r) => ({
    tipo: 'movimento',
    quando: r.quando,
    delta: r.delta,
    causa: r.causa,
    titolo: etichetta(r.causa),
    dettaglio: r.dettaglio,
  }));

  // Le missioni approvate valgono i punti della missione. `reviewed_at` è
  // il momento in cui i punti sono diventati veri, non quando è stata
  // mandata la prova: per capire un punteggio conta quello.
  const mis = db.prepare(`
    SELECT s.id, COALESCE(s.reviewed_at, s.created_at) AS quando, m.points AS delta,
           m.title AS titolo, m.game_key, s.photo_path, u.nickname AS chi
    FROM submissions s
    JOIN missions m ON m.id = s.mission_id
    LEFT JOIN users u ON u.id = s.reviewed_by
    WHERE s.user_id = ? AND s.status = 'approved' AND m.points > 0
  `).all(userId).map((r) => ({
    tipo: 'missione',
    quando: r.quando,
    delta: r.delta,
    causa: r.game_key ? 'traguardo' : 'missione',
    titolo: r.titolo,
    dettaglio: r.game_key
      ? 'Traguardo del mini-gioco (approvato dal server)'
      : (r.chi ? `Approvata da ${r.chi}` : 'Approvata'),
    conFoto: !!r.photo_path,
  }));

  const tutto = mov.concat(mis).sort((a, b) => (a.quando < b.quando ? 1 : -1));
  return limite ? tutto.slice(0, limite) : tutto;
}

// Il totale spaccato per causa: serve a vedere a colpo d'occhio se uno ha
// preso tutto dalla slot o tutto dalle missioni.
function riepilogo(userId) {
  const per = {};
  for (const v of storico(userId)) {
    const k = v.causa;
    if (!per[k]) per[k] = { causa: k, titolo: v.tipo === 'movimento' ? etichetta(k) : (k === 'traguardo' ? 'Traguardi dei giochi' : 'Missioni'), totale: 0, quante: 0 };
    per[k].totale += v.delta;
    per[k].quante++;
  }
  return Object.values(per).sort((a, b) => b.totale - a.totale);
}

// Quanto del saldo attuale NON è spiegato dal registro. Sui conti aperti
// prima che il registro esistesse è normale che ci sia un resto: quei
// movimenti non sono stati registrati e non si possono inventare.
function nonSpiegato(userId) {
  const u = db.prepare('SELECT points_adjust FROM users WHERE id = ?').get(userId);
  if (!u) return 0;
  const r = db.prepare('SELECT COALESCE(SUM(delta), 0) AS s FROM punti_movimenti WHERE user_id = ?').get(userId);
  return u.points_adjust - r.s;
}

// Da dove arrivano i punti di TUTTI, e quanto ne fa in media un giocatore
// per ciascuna voce. Serve al grafico a torta del pannello: dice se il gioco
// gira sulle missioni o se la gente campa di ruota e slot.
//
// La MEDIA è per giocatore ISCRITTO, non per giocatore che quella cosa l'ha
// fatta davvero: se la si dividesse solo fra chi gioca alla slot, la slot
// sembrerebbe enorme e le missioni piccole. Con lo stesso divisore per tutti
// le fette sono confrontabili, che è il punto di una torta.
function riepilogoGlobale() {
  const g = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'user'").get().c || 0;

  const voci = [];
  for (const r of db.prepare(`
    SELECT causa, SUM(delta) AS totale, COUNT(*) AS quante
    FROM punti_movimenti
    JOIN users u ON u.id = punti_movimenti.user_id AND u.role = 'user'
    GROUP BY causa
  `).all()) {
    voci.push({ chiave: r.causa, titolo: etichetta(r.causa), totale: r.totale, quante: r.quante });
  }

  // Le missioni non stanno nel registro: i loro punti vivono in submissions.
  // Si separano dai traguardi dei mini-giochi, che sono missioni anche loro
  // ma non le fa nessuno a mano — mescolarli direbbe una cosa falsa.
  for (const r of db.prepare(`
    SELECT CASE WHEN m.game_key IS NULL THEN 'missione' ELSE 'traguardo' END AS chiave,
           SUM(m.points) AS totale, COUNT(*) AS quante
    FROM submissions s
    JOIN missions m ON m.id = s.mission_id
    JOIN users u ON u.id = s.user_id AND u.role = 'user'
    WHERE s.status = 'approved' AND m.points > 0
    GROUP BY chiave
  `).all()) {
    voci.push({
      chiave: r.chiave,
      titolo: r.chiave === 'missione' ? 'Missioni' : 'Traguardi dei giochi',
      totale: r.totale, quante: r.quante,
    });
  }

  voci.forEach((v) => { v.media = g > 0 ? Math.round(v.totale / g) : 0; });
  voci.sort((a, b) => b.totale - a.totale);
  return { giocatori: g, voci };
}

module.exports = { muovi, storico, riepilogo, riepilogoGlobale, nonSpiegato, etichetta, CAUSE };
