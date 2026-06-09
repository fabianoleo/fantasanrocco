// ---------------------------------------------------------------------------
// seed.js — Utility da riga di comando.
//
//   node src/seed.js                      -> carica le missioni di esempio (se la tabella è vuota)
//   node src/seed.js admin <nick> <pass>  -> crea (o promuove) un utente ADMIN
//
// In Docker:
//   docker compose exec app node src/seed.js admin peppe SuperSegreta123
// ---------------------------------------------------------------------------
require('dotenv').config();
const { db } = require('./db');
const { hashPassword } = require('./auth');

const SAMPLE_MISSIONS = [
  {
    title: '🥃 Shot con Zio Max',
    description: 'Bevi uno shot insieme a Zio Max in persona. Foto come prova!',
    points: 100, requires_photo: 1, repeatable: 1, active_from: null, active_to: null,
  },
  {
    title: '🩳 Pantaloncini arancioni',
    description: 'Fatti vedere con i pantaloncini arancioni la sera del 16 agosto.',
    points: 80, requires_photo: 1, repeatable: 0,
    active_from: '2026-08-16 18:00', active_to: '2026-08-17 03:00',
  },
  {
    title: '📸 Selfie con un Rocco',
    description: 'Trova qualcuno che si chiama Rocco e fatti un selfie insieme.',
    points: 60, requires_photo: 1, repeatable: 0, active_from: null, active_to: null,
  },
  {
    title: '🎆 Foto sotto i fuochi',
    description: 'Scatta una foto durante lo spettacolo dei fuochi d\'artificio.',
    points: 50, requires_photo: 1, repeatable: 0, active_from: null, active_to: null,
  },
  {
    title: '🍝 Piatto tipico sianese',
    description: 'Mangia un piatto tipico alla festa e dichiaralo (niente foto richiesta).',
    points: 30, requires_photo: 0, repeatable: 0, active_from: null, active_to: null,
  },
];

function seedMissions() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM missions').get().n;
  if (count > 0) {
    console.log(`Ci sono già ${count} missioni: non aggiungo quelle di esempio.`);
    return;
  }
  const stmt = db.prepare(`INSERT INTO missions
    (title, description, points, requires_photo, repeatable, active_from, active_to)
    VALUES (@title, @description, @points, @requires_photo, @repeatable, @active_from, @active_to)`);
  const tx = db.transaction((rows) => rows.forEach((r) => stmt.run(r)));
  tx(SAMPLE_MISSIONS);
  console.log(`Caricate ${SAMPLE_MISSIONS.length} missioni di esempio.`);
}

function createAdmin(nickname, password) {
  if (!nickname || !password) {
    console.error('Uso: node src/seed.js admin <nickname> <password>');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('La password deve avere almeno 6 caratteri.');
    process.exit(1);
  }
  const existing = db.prepare('SELECT * FROM users WHERE nickname = ?').get(nickname);
  if (existing) {
    db.prepare('UPDATE users SET role = ?, password_hash = ? WHERE id = ?')
      .run('admin', hashPassword(password), existing.id);
    console.log(`Utente "${nickname}" promosso ad ADMIN e password aggiornata.`);
  } else {
    db.prepare('INSERT INTO users (nickname, password_hash, role) VALUES (?, ?, ?)')
      .run(nickname, hashPassword(password), 'admin');
    console.log(`Creato utente ADMIN "${nickname}".`);
  }
}

const [, , cmd, ...rest] = process.argv;
if (cmd === 'admin') {
  createAdmin(rest[0], rest[1]);
} else {
  seedMissions();
}
