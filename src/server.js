// ---------------------------------------------------------------------------
// server.js — Applicazione FantaSanRocco (Express + EJS + SQLite).
// Tutte le rotte sono qui, divise in sezioni commentate per ritrovarle facilmente.
// ---------------------------------------------------------------------------
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const expressLayouts = require('express-ejs-layouts');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const multer = require('multer');

const nodemailer = require('nodemailer');

const { db, DATA_DIR, UPLOADS_DIR } = require('./db');
const auth = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const SECURE_COOKIES = String(process.env.SECURE_COOKIES).toLowerCase() === 'true';
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 8);

// --- View engine ------------------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// Dietro Cloudflare Tunnel / ngrok: fidati dell'header del proxy così
// req.protocol diventa "https" e i link generati (inviti) sono corretti.
app.set('trust proxy', 1);

// --- Sicurezza di base + body parser ---------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:         ["'self'", 'data:', 'blob:'],
      connectSrc:     ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc:      ["'none'"],
      baseUri:        ["'self'"],
      formAction:     ["'self'"],
    },
  },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
}));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Sessioni (persistite su SQLite, sopravvivono ai riavvii) ---------------
if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  SESSION_SECRET non impostato: usane uno nel file .env!');
}
app.use(session({
  store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 900000 } }),
  name: 'fsr.sid',
  secret: process.env.SESSION_SECRET || 'dev-secret-cambiami',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: SECURE_COOKIES ? 'none' : 'lax',
    secure: SECURE_COOKIES,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 giorni
  },
}));

// --- Flash messages + utente corrente --------------------------------------
app.use((req, res, next) => {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.path = req.path;
  next();
});
app.use(auth.loadCurrentUser);

// --- CSRF protection (synchronizer-token pattern) --------------------------
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

function verifyCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Multipart form bodies non sono ancora parsate qui: le rotte upload gestiscono
  // il check manualmente dentro la callback di multer (dopo il parsing).
  if (req.is('multipart/form-data')) return next();
  const token = req.body._csrf || req.headers['x-csrf-token'];
  if (!token || !req.session.csrfToken || token !== req.session.csrfToken) {
    return res.status(403).render('error', {
      title: 'Errore di sicurezza',
      message: 'Token di sicurezza non valido. Ricarica la pagina e riprova.',
    });
  }
  next();
}
app.use(verifyCsrf);

// --- Utenti online (in-memory, aggiornato ad ogni richiesta) ---------------
const _online = new Map(); // sessionId -> { userId, lastSeen }
const ONLINE_TTL = 5 * 60 * 1000; // 5 minuti di inattività = offline

app.use((req, res, next) => {
  // Traccia solo richieste di pagine, non asset statici
  const isPage = req.method === 'GET'
    && !req.path.startsWith('/images/')
    && !req.path.endsWith('.js')
    && !req.path.endsWith('.css')
    && !req.path.startsWith('/api/');
  if (isPage && req.session) {
    // Forza la creazione del cookie anche per non loggati
    if (!req.session.tracked) req.session.tracked = true;
    _online.set(req.session.id, { userId: req.session.userId || null, lastSeen: Date.now() });
  }
  next();
});
setInterval(() => {
  const cutoff = Date.now() - ONLINE_TTL;
  for (const [id, d] of _online) if (d.lastSeen < cutoff) _online.delete(id);
}, 60_000);

app.get('/api/online', (req, res) => {
  const cutoff = Date.now() - ONLINE_TTL;
  const count = [..._online.values()].filter(d => d.lastSeen >= cutoff).length;
  res.json({ count });
});

// --- Upload foto (multer) ---------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().slice(0, 5);
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Sono ammesse solo immagini.'));
  },
});

// Helper: scrive un flash e prosegue
function flash(req, type, msg) { req.session.flash = { type, msg }; }

// Helper: una missione è attiva adesso?
function isMissionActiveNow(m) {
  const now = new Date();
  if (m.active_from && now < new Date(m.active_from.replace(' ', 'T'))) return false;
  if (m.active_to && now > new Date(m.active_to.replace(' ', 'T'))) return false;
  return true;
}

// =========================================================================
//  PAGINE PUBBLICHE
// =========================================================================
app.get('/', (req, res) => {
  const topThree = leaderboardRows().slice(0, 3);
  res.render('home', { title: 'FantaSanRocco', topThree });
});

// Foto premi — metti i file in public/images/galleria/ e imposta il nome qui.
// Lascia null finché non hai la foto: comparirà un placeholder.
const FOTO_PREMIO_SMARTBOX_COVER = 'smartbox-cover.webp';
const FOTO_PREMIO_SMARTBOX_DEST  = 'smartbox-destinazioni.webp';
const FOTO_PREMIO_PS5   = 'switch-lite.avif';
const FOTO_PREMIO_CAFFE = 'caffe.webp';

app.get('/premio', (req, res) => {
  res.render('prize', {
    title: 'I Premi',
    smartboxCover: FOTO_PREMIO_SMARTBOX_COVER,
    smartboxDest:  FOTO_PREMIO_SMARTBOX_DEST,
    photoPs5:      FOTO_PREMIO_PS5,
    photoCaffe:    FOTO_PREMIO_CAFFE,
  });
});

// Galleria foto pubblica — aggiungi le immagini in public/images/galleria/
// e registrale qui sotto nelle due liste.
// ─── ISTRUZIONI GALLERIA ────────────────────────────────────────────────────
// Salva le foto in:  public/images/galleria/
// Nomi file da usare (rinomina le immagini prima di spostarle):
//
//   sanrocco-chiesa.jpg   → statua del Santo adornata di fiori in chiesa
//   processione.jpg       → il Santo portato a spalla per le vie del paese
//   fuochi.jpg            → fuochi d'artificio sul campanile di notte
//   videomapping.jpg      → videomapping sulla facciata della chiesa
//   campanile.jpg         → il campanile di giorno con oleandri
//
// Poi decommentate le righe qui sotto e riavviate il server.
// ────────────────────────────────────────────────────────────────────────────
const GALLERIA_PROCESSIONE = [
  { file: 'sanrocco-processione.jpg',   caption: 'San Rocco pronto ad essere portato in processione — l\'immagine votiva proiettata alle sue spalle' },
  { file: 'sanrocco-applausi.jpg',      caption: 'San Rocco ricoperto dagli applausi del suo popolo in uscita dalla processione' },
  { file: 'sanrocco-rientro-fuochi.jpg',caption: 'San Rocco pronto a rientrare in chiesa, acclamato dal suo popolo e onorato con fuochi d\'artificio' },
  { file: 'processione.jpg',            caption: 'San Rocco portato a spalla per le vie di Siano' },
  { file: 'sanrocco-chiesa.webp',       caption: 'La statua di San Rocco adornata per la festa' },
];
const GALLERIA_DEVOZIONE = [
  { file: 'sanrocco-popolo.jpg',        caption: 'San Rocco in chiesa: acclamato e immortalato dal suo popolo' },
  { file: 'sanrocco-chiesa-devoti.jpg', caption: 'San Rocco in chiesa dopo la processione, accolto e applaudito dai devoti' },
  { file: 'sanrocco-anziane.jpg',       caption: 'Anziane signore devote interloquiscono all\'interno della chiesa' },
  { file: 'sanrocco-oro.jpg',           caption: 'L\'oro consegnato da generazioni di Sianesi in dono al santo patrono' },
  { file: 'sanrocco-fuochi-anziani.jpg',caption: 'Anziani di Siano osservano i fuochi d\'artificio in onore del Santo' },
  { file: 'sanrocco-maria.jpg',         caption: 'Maria, tra i banchi della chiesa — la devozione che attraversa una vita intera' },
];
const GALLERIA_PALIO = [
  { file: 'palio-fuochi.jpg',       caption: 'I fuochi del Palio esplodono nel cielo di Siano — uno spettacolo rinomato in tutta Italia' },
  { file: 'fuochisti-preparano.jpg',caption: 'I maestri fuochisti al lavoro: la preparazione delle bombe da tiro è un rito antico' },
  { file: 'mano-bomba.jpg',         caption: 'La mano di un maestro fuochista posata sulla bomba — precisione, esperienza e rispetto' },
  { file: 'fuochista-anziano.jpg',  caption: 'Un anziano maestro prepara le bombe: un sapere trasmesso di generazione in generazione' },
  { file: 'palio-collage.jpg',      caption: 'I fuochisti con la percoca nel vino — tradizione irrinunciabile — e le bombe allineate pronte per il Palio' },
];
const GALLERIA_LUOGHI = [
  { file: 'campanile.webp', caption: 'Il campanile di San Rocco, simbolo di Siano' },
  { file: 'piazza.webp',    caption: 'La Piazza San Rocco nel cuore di Siano' },
  { file: 'fuochi.webp',    caption: 'I fuochi d\'artificio illuminano il campanile nella notte della festa' },
];

app.get('/galleria', (req, res) => {
  res.render('galleria', {
    title: 'Galleria',
    processione: GALLERIA_PROCESSIONE,
    devozione:   GALLERIA_DEVOZIONE,
    luoghi:      GALLERIA_LUOGHI,
    palio:       GALLERIA_PALIO,
  });
});

// Classifica generale (solo giocatori, esclude staff)
function leaderboardRows() {
  return db.prepare(`
    SELECT u.id, u.nickname,
           COALESCE(SUM(CASE WHEN s.status='approved' THEN m.points ELSE 0 END), 0) AS points,
           COUNT(CASE WHEN s.status='approved' THEN 1 END) AS done
    FROM users u
    LEFT JOIN submissions s ON s.user_id = u.id
    LEFT JOIN missions m    ON m.id = s.mission_id
    WHERE u.role = 'user'
    GROUP BY u.id
    ORDER BY points DESC, u.created_at ASC
  `).all();
}

app.get('/classifica', (req, res) => {
  res.render('leaderboard', { title: 'Classifica', rows: leaderboardRows(), currentUserId: req.currentUser?.id ?? null });
});

// =========================================================================
//  AUTENTICAZIONE (registrazione leggera: nickname + password, email facoltativa)
// =========================================================================
const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5,  standardHeaders: true, legacyHeaders: false });
const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
app.use(globalLimiter);

// --- Registrazione SOLO su invito personale --------------------------------
// Ogni persona riceve un link unico /registrati/<token>. Vale una sola volta:
// appena viene usato si "brucia" (un altro dispositivo trova "invito già usato").
// La registrazione aperta è disabilitata.

function getInvite(token) {
  if (!token) return null;
  return db.prepare('SELECT * FROM invites WHERE token = ?').get(token);
}

// Pagina informativa: se arrivi su /registrati senza token
app.get('/registrati', (req, res) => res.render('register-needed', { title: 'Registrazione su invito' }));

// Form di registrazione legato a un invito
app.get('/registrati/:token', (req, res) => {
  const inv = getInvite(req.params.token);
  if (!inv) return res.status(404).render('error', { title: 'Invito non valido', message: 'Questo link di registrazione non è valido. Chiedi all\'organizzazione un link corretto.' });
  if (inv.used) return res.status(410).render('error', { title: 'Invito già usato', message: 'Questo link è già stato usato per registrarsi. Ogni invito vale per una sola persona / un solo dispositivo. Se sei già registrato, vai su Accedi.' });
  res.render('register', { title: 'Registrati', token: inv.token, label: inv.label });
});

app.post('/registrati/:token', (req, res) => {
  const inv = getInvite(req.params.token);
  if (!inv) return res.status(404).render('error', { title: 'Invito non valido', message: 'Questo link di registrazione non è valido.' });
  if (inv.used) return res.status(410).render('error', { title: 'Invito già usato', message: 'Questo link è già stato usato.' });

  const nickname = (req.body.nickname || '').trim();
  const email    = (req.body.email || '').trim().toLowerCase() || null;
  const password = req.body.password || '';

  if (nickname.length < 2 || nickname.length > 24) {
    flash(req, 'error', 'Il nickname deve avere tra 2 e 24 caratteri.');
    return res.redirect('/registrati/' + inv.token);
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    flash(req, 'error', 'Inserisci un indirizzo email valido.');
    return res.redirect('/registrati/' + inv.token);
  }
  if (password.length < 8) {
    flash(req, 'error', 'La password deve avere almeno 8 caratteri.');
    return res.redirect('/registrati/' + inv.token);
  }
  const exists = db.prepare('SELECT id FROM users WHERE nickname = ?').get(nickname);
  if (exists) {
    flash(req, 'error', 'Nickname già in uso, scegline un altro.');
    return res.redirect('/registrati/' + inv.token);
  }

  // Consuma l'invito e crea l'utente in un'unica transazione atomica.
  // L'UPDATE "... WHERE used=0" garantisce che due dispositivi non possano
  // usare lo stesso link in parallelo: solo il primo va a buon fine.
  let newId;
  try {
    newId = db.transaction(() => {
      const consumed = db.prepare("UPDATE invites SET used = 1, used_at = datetime('now') WHERE token = ? AND used = 0").run(inv.token);
      if (consumed.changes === 0) throw new Error('USED');
      const info = db.prepare('INSERT INTO users (nickname, email, password_hash) VALUES (?, ?, ?)')
        .run(nickname, email, auth.hashPassword(password));
      db.prepare('UPDATE invites SET used_by_user_id = ? WHERE token = ?').run(info.lastInsertRowid, inv.token);
      return info.lastInsertRowid;
    })();
  } catch (e) {
    if (e.message === 'USED') {
      return res.status(410).render('error', { title: 'Invito già usato', message: 'Qualcuno ha appena usato questo link da un altro dispositivo.' });
    }
    throw e;
  }

  // Registrazione "a parte": NON facciamo login automatico.
  // Mostriamo la conferma con il link per giocare (Accedi).
  res.render('register-done', { title: 'Registrazione completata', nickname });
});

app.get('/login', (req, res) => res.render('login', { title: 'Accedi' }));

app.post('/login', loginLimiter, (req, res) => {
  const nickname = (req.body.nickname || '').trim();
  const password = req.body.password || '';
  const user = db.prepare('SELECT * FROM users WHERE nickname = ?').get(nickname);
  if (!user || !auth.verifyPassword(password, user.password_hash)) {
    flash(req, 'error', 'Nickname o password errati.');
    return res.redirect('/login');
  }
  // Rigenera la sessione per prevenire session-fixation attacks
  req.session.regenerate((err) => {
    if (err) { flash(req, 'error', 'Errore interno. Riprova.'); return res.redirect('/login'); }
    req.session.userId = user.id;
    req.session.flash = { type: 'success', msg: `Bentornato/a ${user.nickname}!` };
    res.redirect('/missioni');
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// =========================================================================
//  RECUPERO PASSWORD (utenti non loggati)
// =========================================================================

// Crea un transporter nodemailer.
// Priorità: se EMAIL_USER è impostato usa Gmail (semplice per Render).
// Se invece SMTP_HOST è impostato usa configurazione SMTP completa.
// Altrimenti dev-mode: il link viene stampato in console.
function makeMailTransporter() {
  if (process.env.EMAIL_USER) {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return null;
}

app.get('/programmazione', (req, res) => {
  res.render('programmazione', { title: 'Programmazione' });
});

app.get('/storia', (req, res) => {
  res.render('storia', { title: 'La Storia di San Rocco' });
});

app.get('/password-dimenticata', (req, res) => {
  if (req.currentUser) return res.redirect('/profilo');
  res.render('forgot-password', { title: 'Password dimenticata' });
});

app.post('/password-dimenticata', resetLimiter, (req, res) => {
  if (req.currentUser) return res.redirect('/profilo');
  const email = (req.body.email || '').trim().toLowerCase();

  // Risposta generica per non rivelare se l'email è registrata
  const genericMsg = 'Se l\'email è registrata riceverai un link di reset entro qualche minuto. Controlla anche la cartella spam.';

  if (!email) {
    flash(req, 'error', 'Inserisci un indirizzo email.');
    return res.redirect('/password-dimenticata');
  }

  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
  if (!user) {
    flash(req, 'success', genericMsg);
    return res.redirect('/login');
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 ora
  db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?')
    .run(token, expires, user.id);

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const resetLink = `${baseUrl}/reset-password/${token}`;

  const transporter = makeMailTransporter();
  if (transporter) {
    transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.EMAIL_USER || process.env.SMTP_USER,
      to: user.email,
      subject: 'FantaSanRocco – Reset password',
      text: `Ciao ${user.nickname},\n\nHai richiesto il reset della password.\nClicca qui (scade tra 1 ora):\n${resetLink}\n\nSe non sei stato tu, ignora questa email.`,
      html: `<p>Ciao <strong>${user.nickname}</strong>,</p>
             <p>Hai richiesto il reset della password.</p>
             <p><a href="${resetLink}">Clicca qui per impostare una nuova password</a> (link valido 1 ora).</p>
             <p class="muted">Se non sei stato tu, ignora questa email.</p>`,
    }).catch((err) => console.error('Errore invio email reset:', err));
  } else {
    // Modalità sviluppo: link visibile solo in console
    console.log(`\n🔑 RESET LINK (dev): ${resetLink}\n`);
    if (process.env.NODE_ENV !== 'production') {
      flash(req, 'success', `[DEV] Link reset: ${resetLink}`);
    } else {
      flash(req, 'success', genericMsg);
    }
    return res.redirect('/login');
  }

  flash(req, 'success', genericMsg);
  res.redirect('/login');
});

app.get('/reset-password/:token', (req, res) => {
  if (req.currentUser) return res.redirect('/profilo');
  const user = db.prepare(
    "SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > datetime('now')"
  ).get(req.params.token);
  if (!user) {
    return res.render('error', { title: 'Link non valido', message: 'Il link di reset è scaduto o non è valido. Richiedi un nuovo link dalla pagina di login.' });
  }
  res.render('reset-password', { title: 'Nuova password', token: req.params.token });
});

app.post('/reset-password/:token', (req, res) => {
  if (req.currentUser) return res.redirect('/profilo');
  const user = db.prepare(
    "SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > datetime('now')"
  ).get(req.params.token);
  if (!user) {
    return res.render('error', { title: 'Link non valido', message: 'Il link di reset è scaduto o già utilizzato.' });
  }

  const password = req.body.password || '';
  const confirm = req.body.confirm || '';
  if (password.length < 8) {
    flash(req, 'error', 'La password deve avere almeno 8 caratteri.');
    return res.redirect(`/reset-password/${req.params.token}`);
  }
  if (password !== confirm) {
    flash(req, 'error', 'Le due password non coincidono.');
    return res.redirect(`/reset-password/${req.params.token}`);
  }

  db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?')
    .run(auth.hashPassword(password), user.id);

  flash(req, 'success', 'Password aggiornata! Puoi ora accedere con la nuova password.');
  res.redirect('/login');
});

// =========================================================================
//  MISSIONI + INVIO PROVE (utenti loggati)
// =========================================================================
app.get('/missioni', auth.requireLogin, (req, res) => {
  const missions = db.prepare('SELECT * FROM missions WHERE archived = 0 ORDER BY points DESC, id ASC').all();
  const mySubs = db.prepare('SELECT mission_id, status FROM submissions WHERE user_id = ?').all(req.currentUser.id);
  const byMission = {};
  for (const s of mySubs) {
    (byMission[s.mission_id] = byMission[s.mission_id] || []).push(s.status);
  }
  // Contatore completamenti approvati per missione
  const rows = db.prepare(`
    SELECT mission_id, COUNT(DISTINCT user_id) AS cnt
    FROM submissions WHERE status = 'approved'
    GROUP BY mission_id
  `).all();
  const completedCount = {};
  for (const r of rows) completedCount[r.mission_id] = r.cnt;

  const list = missions.map((m) => {
    const statuses = byMission[m.id] || [];
    return {
      ...m,
      activeNow: isMissionActiveNow(m),
      hasPending:    statuses.includes('pending'),
      hasApproved:   statuses.includes('approved'),
      canSubmit: m.repeatable
        ? !statuses.includes('pending')
        : !(statuses.includes('pending') || statuses.includes('approved')),
      completedBy: completedCount[m.id] || 0,
    };
  });
  res.render('missions', { title: 'Missioni', missions: list });
});

app.get('/missioni/:id', auth.requireLogin, (req, res) => {
  const m = db.prepare('SELECT * FROM missions WHERE id = ? AND archived = 0').get(req.params.id);
  if (!m) return res.status(404).render('error', { title: 'Non trovata', message: 'Missione inesistente.' });
  const statuses = db.prepare('SELECT status FROM submissions WHERE user_id = ? AND mission_id = ?')
    .all(req.currentUser.id, m.id).map((r) => r.status);
  const canSubmit = m.repeatable
    ? !statuses.includes('pending')
    : !(statuses.includes('pending') || statuses.includes('approved'));
  res.render('mission', {
    title: m.title.replace(/[^\p{L}\p{N} ]/gu, '').trim() || 'Missione',
    m, statuses, canSubmit, activeNow: isMissionActiveNow(m),
  });
});

app.post('/missioni/:id/invia', auth.requireLogin, (req, res) => {
  const m = db.prepare('SELECT * FROM missions WHERE id = ? AND archived = 0').get(req.params.id);
  if (!m) return res.status(404).render('error', { title: 'Non trovata', message: 'Missione inesistente.' });

  // Gestione upload (può fallire per dimensione/tipo)
  upload.single('foto')(req, res, (err) => {
    if (err) {
      flash(req, 'error', err.message || 'Errore nel caricamento della foto.');
      return res.redirect(`/missioni/${m.id}`);
    }
    // CSRF check per multipart (body disponibile solo dopo multer)
    const csrfToken = req.body._csrf || '';
    if (!csrfToken || csrfToken !== req.session.csrfToken) {
      if (req.file) fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
      return res.status(403).render('error', { title: 'Errore di sicurezza', message: 'Token non valido. Ricarica la pagina.' });
    }
    if (!isMissionActiveNow(m)) {
      flash(req, 'error', 'Questa missione non è attiva in questo momento.');
      return res.redirect(`/missioni/${m.id}`);
    }
    // Regole di ripetibilità
    const statuses = db.prepare('SELECT status FROM submissions WHERE user_id = ? AND mission_id = ?')
      .all(req.currentUser.id, m.id).map((r) => r.status);
    const blocked = m.repeatable
      ? statuses.includes('pending')
      : (statuses.includes('pending') || statuses.includes('approved'));
    if (blocked) {
      if (req.file) fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
      flash(req, 'error', 'Hai già inviato questa missione (in attesa o approvata).');
      return res.redirect(`/missioni/${m.id}`);
    }
    // Foto obbligatoria?
    if (m.requires_photo && !req.file) {
      flash(req, 'error', 'Questa missione richiede una foto come prova.');
      return res.redirect(`/missioni/${m.id}`);
    }
    db.prepare(`INSERT INTO submissions (user_id, mission_id, photo_path, note)
                VALUES (?, ?, ?, ?)`)
      .run(req.currentUser.id, m.id, req.file ? req.file.filename : null, (req.body.note || '').trim());
    flash(req, 'success', 'Prova inviata! Ora aspetta la validazione dello staff. 📨');
    res.redirect('/missioni');
  });
});

// =========================================================================
//  PROFILO
// =========================================================================
app.get('/profilo', auth.requireLogin, (req, res) => {
  const subs = db.prepare(`
    SELECT s.*, m.title, m.points
    FROM submissions s JOIN missions m ON m.id = s.mission_id
    WHERE s.user_id = ?
    ORDER BY s.created_at DESC
  `).all(req.currentUser.id);
  const total = subs.filter((s) => s.status === 'approved').reduce((a, s) => a + s.points, 0);
  res.render('profile', { title: 'Il mio profilo', subs, total });
});

// Cambio password (utente loggato)
app.post('/profilo/cambia-password', auth.requireLogin, (req, res) => {
  const current = req.body.current_password || '';
  const newPass = req.body.new_password || '';
  const confirm = req.body.confirm_password || '';

  if (!auth.verifyPassword(current, req.currentUser.password_hash)) {
    flash(req, 'error', 'La password attuale non è corretta.');
    return res.redirect('/profilo');
  }
  if (newPass.length < 8) {
    flash(req, 'error', 'La nuova password deve avere almeno 8 caratteri.');
    return res.redirect('/profilo');
  }
  if (newPass !== confirm) {
    flash(req, 'error', 'La nuova password e la conferma non coincidono.');
    return res.redirect('/profilo');
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(auth.hashPassword(newPass), req.currentUser.id);
  flash(req, 'success', 'Password aggiornata con successo.');
  res.redirect('/profilo');
});

// Le foto sono PRIVATE: le vede solo lo staff (moderatori/admin)
app.get('/uploads/:file', auth.requireStaff, (req, res) => {
  const safe = path.basename(req.params.file);
  const full = path.join(UPLOADS_DIR, safe);
  if (!fs.existsSync(full)) return res.status(404).send('File non trovato');
  res.sendFile(full);
});

// =========================================================================
//  MODERAZIONE (moderatori + admin)
// =========================================================================
app.get('/moderazione', auth.requireStaff, (req, res) => {
  const pending = db.prepare(`
    SELECT s.*, u.nickname, m.title, m.points, m.requires_photo
    FROM submissions s
    JOIN users u ON u.id = s.user_id
    JOIN missions m ON m.id = s.mission_id
    WHERE s.status = 'pending'
    ORDER BY s.created_at ASC
  `).all();
  res.render('moderation', { title: 'Moderazione', pending });
});

// Approva / Rifiuta. L'UPDATE con "WHERE status='pending'" è la garanzia
// anti doppia-approvazione: se un altro moderatore l'ha già gestita, changes = 0.
app.post('/moderazione/:id/:azione', auth.requireStaff, (req, res) => {
  const azione = req.params.azione === 'approva' ? 'approved' : 'rejected';
  const reviewNote = (req.body.review_note || '').trim();
  const info = db.prepare(`
    UPDATE submissions
    SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_note = ?
    WHERE id = ? AND status = 'pending'
  `).run(azione, req.currentUser.id, reviewNote, req.params.id);

  if (info.changes === 0) {
    flash(req, 'error', 'Già gestita da un altro moderatore (oppure non esiste più).');
  } else {
    flash(req, 'success', azione === 'approved' ? 'Approvata ✅' : 'Rifiutata ❌');
  }
  res.redirect('/moderazione');
});

// =========================================================================
//  ADMIN (gestione missioni + ruoli)
// =========================================================================
app.get('/admin', auth.requireAdmin, (req, res) => {
  const missions = db.prepare('SELECT * FROM missions ORDER BY id DESC').all();
  const users = db.prepare('SELECT id, nickname, email, role, created_at FROM users ORDER BY role, nickname').all();
  const invites = db.prepare(`
    SELECT i.*, u.nickname AS used_by_nick
    FROM invites i LEFT JOIN users u ON u.id = i.used_by_user_id
    ORDER BY i.used ASC, i.id DESC
  `).all();
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.render('admin', { title: 'Admin', missions, users, invites, baseUrl });
});

// Genera N inviti (link di registrazione monouso)
app.post('/admin/inviti', auth.requireAdmin, (req, res) => {
  const count = Math.min(Math.max(parseInt(req.body.count, 10) || 1, 1), 100);
  const label = (req.body.label || '').trim() || null;
  const stmt = db.prepare('INSERT INTO invites (token, label, created_by) VALUES (?, ?, ?)');
  db.transaction((n) => {
    for (let i = 0; i < n; i++) stmt.run(crypto.randomBytes(16).toString('hex'), label, req.currentUser.id);
  })(count);
  flash(req, 'success', `Generati ${count} invito/i.`);
  res.redirect('/admin');
});

// Elimina un invito NON ancora usato
app.post('/admin/inviti/:id/elimina', auth.requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM invites WHERE id = ? AND used = 0').run(req.params.id);
  flash(req, info.changes ? 'success' : 'error', info.changes ? 'Invito eliminato.' : 'Non puoi eliminare un invito già usato.');
  res.redirect('/admin');
});

app.post('/admin/missioni', auth.requireAdmin, (req, res) => {
  const b = req.body;
  const title = (b.title || '').trim();
  if (!title) { flash(req, 'error', 'Il titolo è obbligatorio.'); return res.redirect('/admin'); }
  db.prepare(`INSERT INTO missions
    (title, description, points, requires_photo, repeatable, active_from, active_to)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    title,
    (b.description || '').trim(),
    parseInt(b.points, 10) || 0,
    b.requires_photo ? 1 : 0,
    b.repeatable ? 1 : 0,
    (b.active_from || '').trim() || null,
    (b.active_to || '').trim() || null,
  );
  flash(req, 'success', 'Missione creata.');
  res.redirect('/admin');
});

app.post('/admin/missioni/:id/modifica', auth.requireAdmin, (req, res) => {
  const b = req.body;
  db.prepare(`UPDATE missions SET
    title=?, description=?, points=?, requires_photo=?, repeatable=?, active_from=?, active_to=?, archived=?
    WHERE id=?`).run(
    (b.title || '').trim(),
    (b.description || '').trim(),
    parseInt(b.points, 10) || 0,
    b.requires_photo ? 1 : 0,
    b.repeatable ? 1 : 0,
    (b.active_from || '').trim() || null,
    (b.active_to || '').trim() || null,
    b.archived ? 1 : 0,
    req.params.id,
  );
  flash(req, 'success', 'Missione aggiornata.');
  res.redirect('/admin');
});

app.post('/admin/missioni/:id/elimina', auth.requireAdmin, (req, res) => {
  db.prepare('DELETE FROM missions WHERE id = ?').run(req.params.id);
  flash(req, 'success', 'Missione eliminata.');
  res.redirect('/admin');
});

// Reset gioco: cancella tutto tranne gli admin
app.post('/admin/reset-gioco', auth.requireAdmin, (req, res) => {
  // Doppia conferma via campo testo: l'admin deve scrivere "RESET"
  if ((req.body.conferma || '').trim().toUpperCase() !== 'RESET') {
    flash(req, 'error', 'Conferma non corretta. Scrivi RESET nel campo per procedere.');
    return res.redirect('/admin');
  }
  db.transaction(() => {
    db.prepare('DELETE FROM submissions').run();
    db.prepare('DELETE FROM invites').run();
    db.prepare("DELETE FROM users WHERE role != 'admin'").run();
  })();
  flash(req, 'success', 'Gioco resettato: utenti, prove e inviti eliminati. Gli admin sono rimasti.');
  res.redirect('/admin');
});

app.post('/admin/utenti/:id/ruolo', auth.requireAdmin, (req, res) => {
  const role = ['user', 'moderator', 'admin'].includes(req.body.role) ? req.body.role : 'user';
  const target = auth.getUserById(req.params.id);
  if (!target) { flash(req, 'error', 'Utente inesistente.'); return res.redirect('/admin'); }
  // Evita di togliere l'ultimo admin (lockout di sé stessi)
  if (target.role === 'admin' && role !== 'admin') {
    const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").get().n;
    if (admins <= 1) { flash(req, 'error', 'Non puoi rimuovere l\'ultimo admin.'); return res.redirect('/admin'); }
  }
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, target.id);
  flash(req, 'success', `Ruolo di ${target.nickname} aggiornato a ${role}.`);
  res.redirect('/admin');
});

// --- 404 --------------------------------------------------------------------
app.use((req, res) => res.status(404).render('error', { title: 'Pagina non trovata', message: 'Ops, questa pagina non esiste.' }));

// --- 500 (non espone mai stack trace in produzione) -------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  const msg = process.env.NODE_ENV === 'production'
    ? 'Si è verificato un errore interno. Riprova tra qualche istante.'
    : err.message;
  res.status(err.status || 500).render('error', { title: 'Errore', message: msg });
});

app.listen(PORT, () => {
  console.log(`\n🎉 FantaSanRocco è attivo — accessibile via Cloudflare Tunnel.`);
  console.log(`   Dati salvati in: ${DATA_DIR}\n`);
});
