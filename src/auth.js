// ---------------------------------------------------------------------------
// auth.js — Helper per password, utente corrente e controllo dei ruoli.
// ---------------------------------------------------------------------------
const bcrypt = require('bcryptjs');
const { db } = require('./db');

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// Middleware: carica l'utente loggato in req.currentUser e res.locals.currentUser
function loadCurrentUser(req, res, next) {
  req.currentUser = null;
  if (req.session && req.session.userId) {
    const u = getUserById(req.session.userId);
    if (u) req.currentUser = u;
  }
  res.locals.currentUser = req.currentUser;
  next();
}

// Richiede login
function requireLogin(req, res, next) {
  if (!req.currentUser) {
    req.session.flash = { type: 'error', msg: 'Devi accedere per continuare.' };
    return res.redirect('/login');
  }
  next();
}

// Richiede ruolo moderatore O admin
function requireStaff(req, res, next) {
  if (!req.currentUser || !['moderator', 'admin'].includes(req.currentUser.role)) {
    return res.status(403).render('error', { title: 'Vietato', message: 'Area riservata allo staff.' });
  }
  next();
}

// Richiede ruolo admin
function requireAdmin(req, res, next) {
  if (!req.currentUser || req.currentUser.role !== 'admin') {
    return res.status(403).render('error', { title: 'Vietato', message: 'Area riservata agli admin.' });
  }
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  getUserById,
  loadCurrentUser,
  requireLogin,
  requireStaff,
  requireAdmin,
};
