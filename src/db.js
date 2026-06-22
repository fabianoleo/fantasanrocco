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

// Assicura che le cartelle esistano
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(AVATARS_DIR, { recursive: true });

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
// game_key: marca una "missione" come traguardo del mini-gioco (esclusa dalle missioni-foto)
try { db.exec('ALTER TABLE missions ADD COLUMN game_key TEXT'); } catch {}

module.exports = { db, DATA_DIR, UPLOADS_DIR, AVATARS_DIR };
