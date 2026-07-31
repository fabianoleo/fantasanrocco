// ===================================================================
// FantaSanRocco — LE CLASSIFICHE
// -------------------------------------------------------------------
// Le quattro interrogazioni che producono le graduatorie: quella
// generale a punti e le due dei mini-giochi, che vanno a record e sono
// una gara separata. Qui dentro si parla solo col database.
//
// Il totale in classifica e': somma dei punti delle missioni APPROVATE
// piu' points_adjust. Chi cambia questa formula la deve cambiare in
// tutti e due i punti, ed e' il motivo per cui stanno vicine.
// ===================================================================
const { db } = require('../db');

// Classifica generale (solo giocatori, esclude staff)
// Questa query somma TUTTE le prove approvate di TUTTI gli utenti. Misurata
// con 1000 iscritti e 100.000 prove costa 25ms di CPU, e better-sqlite3 è
// sincrono: mentre gira, il server non risponde a nessun altro. Il problema
// non è la classifica in sé — è che la home la esegue a ogni caricamento per
// mostrare il podio dei primi tre. A 100 pagine al secondo (un picco dopo i
// fuochi) i due core andrebbero al 124%: il sito si impasta.
//
// Con una cache di pochi secondi il conto si fa una volta e si serve a tutti.
// Il ritardo massimo e' cinque secondi, e su una classifica non lo nota
// nessuno. Niente invalidazione a mano quando i punti cambiano: i posti che
// li toccano sono dodici, e una invalidazione applicata in undici sarebbe
// peggio di nessuna — prometterebbe un aggiornamento immediato che poi
// tradisce a caso. Il tempo che scade vale per tutti allo stesso modo.
//
// ATTENZIONE: userPoints() qui sotto NON passa da questa cache, ed e'
// voluto. La slot controlla il saldo dentro la transazione per decidere se
// una puntata e' coperta: con un valore vecchio di cinque secondi si
// potrebbero spendere punti che non ci sono piu'.
const CACHE_MS = 5000;
let cache = null;
let cacheScade = 0;

function leaderboardRows() {
  const ora = Date.now();
  if (cache && ora < cacheScade) return cache;
  cache = db.prepare(`
    SELECT u.id, u.nickname, u.avatar_path,
           COALESCE(SUM(CASE WHEN s.status='approved' THEN m.points ELSE 0 END), 0) + u.points_adjust AS points,
           COUNT(CASE WHEN s.status='approved' THEN 1 END) AS done
    FROM users u
    LEFT JOIN submissions s ON s.user_id = u.id
    LEFT JOIN missions m    ON m.id = s.mission_id
    WHERE u.role = 'user'
    GROUP BY u.id
    ORDER BY points DESC, u.created_at ASC
  `).all();
  cacheScade = ora + CACHE_MS;
  return cache;
}


// Saldo punti spendibile di un utente = missioni/gioco approvati + saldo ruota/slot.
// È lo STESSO totale mostrato in classifica: ruota e slot girano su questi punti.
function userPoints(userId) {
  const r = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN s.status='approved' THEN m.points ELSE 0 END), 0) AS pts
    FROM submissions s JOIN missions m ON m.id = s.mission_id
    WHERE s.user_id = ?
  `).get(userId);
  const u = db.prepare('SELECT points_adjust FROM users WHERE id = ?').get(userId);
  return (r ? r.pts : 0) + (u ? u.points_adjust : 0);
}

// Classifica del mini-gioco: per punteggio record (solo chi ha giocato)
function gameLeaderboardRows() {
  return db.prepare(`
    SELECT id, nickname, game_best AS best
    FROM users
    WHERE role = 'user' AND game_best > 0
    ORDER BY game_best DESC, created_at ASC
  `).all();
}

// Classifica di «San Rocco Jetpack»: per record di distanza (solo chi ha volato).
// Le stelle servono solo da secondo criterio a parità di metri.
function jetpackLeaderboardRows() {
  return db.prepare(`
    SELECT id, nickname, jp_best AS best, jp_stars AS stars
    FROM users
    WHERE role = 'user' AND jp_best > 0
    ORDER BY jp_best DESC, jp_stars DESC, created_at ASC
  `).all();
}

module.exports = { leaderboardRows, userPoints, gameLeaderboardRows, jetpackLeaderboardRows };
