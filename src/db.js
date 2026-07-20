// ---------------------------------------------------------------------------
// db.js — Inizializza il database SQLite e crea le tabelle se non esistono.
// Usiamo better-sqlite3: sincrono, semplicissimo, un solo file su disco.
// ---------------------------------------------------------------------------
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Cartella dati configurabile (default ./data). Qui dentro: db + foto caricate.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '..', 'data');

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');     // foto-prova (private)
const AVATARS_DIR = path.join(DATA_DIR, 'avatars');     // foto profilo (pubbliche)
const STORIES_DIR = path.join(DATA_DIR, 'stories');     // foto delle storie (24h)
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');      // snapshot automatici del database

// Assicura che le cartelle esistano
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(AVATARS_DIR, { recursive: true });
fs.mkdirSync(STORIES_DIR, { recursive: true });
fs.mkdirSync(BACKUPS_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'fantasanrocco.db'));
db.pragma('journal_mode = WAL'); // più robusto con letture/scritture concorrenti
db.pragma('foreign_keys = ON');

// --- Schema -----------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',   -- user | moderator | admin
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS missions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  points        INTEGER NOT NULL DEFAULT 0,
  requires_photo INTEGER NOT NULL DEFAULT 1,    -- 0/1
  repeatable    INTEGER NOT NULL DEFAULT 0,     -- 0/1
  active_from   TEXT,                           -- ISO datetime o NULL (sempre attiva)
  active_to     TEXT,                           -- ISO datetime o NULL
  archived      INTEGER NOT NULL DEFAULT 0,     -- 0/1: nascosta ai giocatori
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id    INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  photo_path    TEXT,                           -- nome file in data/uploads, o NULL
  note          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  reviewed_by   INTEGER REFERENCES users(id),
  reviewed_at   TEXT,
  review_note   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sub_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_sub_user   ON submissions(user_id);

-- Storie effimere (foto): visibili 24h, poi cancellate (riga + file)
CREATE TABLE IF NOT EXISTS stories (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_path    TEXT NOT NULL,                  -- nome file in data/stories
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL                   -- datetime('now','+1 day')
);
CREATE INDEX IF NOT EXISTS idx_stories_exp  ON stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id);

-- Chi ha visto quale storia (per l'anello "non viste")
CREATE TABLE IF NOT EXISTS story_views (
  story_id      INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seen_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (story_id, user_id)
);
`);

// Migrazioni: aggiunge colonne se non esistono ancora (idempotente)
try { db.exec('ALTER TABLE users ADD COLUMN reset_token TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN reset_token_expires TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN avatar_path TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN game_best INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN game_plays INTEGER NOT NULL DEFAULT 0'); } catch {}
// Saldo netto da ruota + slot (può essere negativo per le perdite alla slot):
// entra nel totale punti della classifica → ruota e slot girano sugli stessi punti.
try { db.exec('ALTER TABLE users ADD COLUMN points_adjust INTEGER NOT NULL DEFAULT 0'); } catch {}
// Ultimo giorno (YYYY-MM-DD) in cui l'utente ha girato la ruota gratuita
try { db.exec('ALTER TABLE users ADD COLUMN last_wheel_day TEXT'); } catch {}
// Streak giornaliero: giorno corrente del ciclo (1-7) e ultimo giorno rivendicato (YYYY-MM-DD)
try { db.exec('ALTER TABLE users ADD COLUMN streak_day INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN streak_last_day TEXT'); } catch {}
// game_key: marca una "missione" come traguardo del mini-gioco (esclusa dalle missioni-foto)
try { db.exec('ALTER TABLE missions ADD COLUMN game_key TEXT'); } catch {}

// Codici premio monouso (link/QR): il PRIMO utente loggato che apre il link
// riscatta i punti; chi arriva dopo non guadagna nulla.
db.exec(`
CREATE TABLE IF NOT EXISTS reward_codes (
  code        TEXT PRIMARY KEY,
  points      INTEGER NOT NULL,
  label       TEXT,
  claimed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  claimed_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Iscrizioni alle notifiche push (Web Push). user_id NULL = utente non loggato.
db.exec(`
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// 2FA (TOTP) per gli admin/staff
try { db.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN totp_backup_codes TEXT'); } catch {}  // JSON di hash

// GDPR: data/ora di accettazione della privacy policy in registrazione (prova del consenso)
try { db.exec('ALTER TABLE users ADD COLUMN privacy_accepted_at TEXT'); } catch {}

// Bonus notifiche: 1 se l'utente ha ricevuto i +100 punti perché ha le push
// attive. Legato all'esistenza di un'iscrizione: se le disattiva, si toglie.
try { db.exec('ALTER TABLE users ADD COLUMN notif_bonus INTEGER NOT NULL DEFAULT 0'); } catch {}

// Preferenza staff: 1 = ricevo la notifica push quando un utente carica una
// prova da validare. Categoria SEPARATA dalle notifiche normali → si può
// disattivare solo questa. Rilevante solo per admin/moderatori.
try { db.exec('ALTER TABLE users ADD COLUMN notif_submissions INTEGER NOT NULL DEFAULT 1'); } catch {}

// Registro delle azioni sensibili (chi ha fatto cosa, quando): trasparenza e
// tracciabilità per un pannello con più admin/moderatori.
db.exec(`
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  nickname    TEXT NOT NULL,          -- copia testuale: resta leggibile anche se l'utente viene eliminato
  action      TEXT NOT NULL,
  details     TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Segnalazioni delle storie (contenuti pubblici tra utenti): revisione manuale staff.
db.exec(`
CREATE TABLE IF NOT EXISTS story_reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id    INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(story_id, reporter_id)
);
`);
try { db.exec('ALTER TABLE stories ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0'); } catch {}

// Pronostico Palio dei Fuochi: ogni utente sceglie UN fuochista (0-5); chi indovina
// vince punti. awarded_points memorizza quanto già accreditato (per storno idempotente).
db.exec(`
CREATE TABLE IF NOT EXISTS palio_predictions (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  choice         INTEGER NOT NULL,          -- indice 0-5 del fuochista scelto
  awarded_points INTEGER NOT NULL DEFAULT 0,-- punti già accreditati per questa scelta
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Stato del pronostico (riga singola id=1): aperto/chiuso, vincitore, punti in palio.
db.exec(`
CREATE TABLE IF NOT EXISTS palio_pronostico (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  open        INTEGER NOT NULL DEFAULT 1,    -- 1 = si può ancora pronosticare
  winner      INTEGER,                        -- indice 0-5 del vincitore, NULL finché non dichiarato
  points      INTEGER NOT NULL DEFAULT 500,   -- punti per chi indovina
  resolved_at TEXT
);
`);
db.prepare('INSERT OR IGNORE INTO palio_pronostico (id, open, winner, points) VALUES (1, 1, NULL, 500)').run();

// Pronostici generici (creabili dal pannello admin): domanda + opzioni libere.
// Separati dal pronostico speciale del Palio. options = JSON array di stringhe.
db.exec(`
CREATE TABLE IF NOT EXISTS predictions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  options     TEXT NOT NULL,                 -- JSON: ["Opzione A","Opzione B", ...]
  points      INTEGER NOT NULL DEFAULT 100,  -- punti per chi indovina
  open        INTEGER NOT NULL DEFAULT 1,    -- 1 = si può ancora pronosticare
  winner      INTEGER,                        -- indice opzione vincente, NULL finché non dichiarato
  archived    INTEGER NOT NULL DEFAULT 0,    -- nascosto ai giocatori
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS prediction_votes (
  prediction_id  INTEGER NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  choice         INTEGER NOT NULL,           -- indice opzione scelta
  awarded_points INTEGER NOT NULL DEFAULT 0, -- punti già accreditati (storno idempotente)
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (prediction_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_pvotes_pred ON prediction_votes(prediction_id);
`);

module.exports = { db, DATA_DIR, UPLOADS_DIR, AVATARS_DIR, STORIES_DIR, BACKUPS_DIR };
