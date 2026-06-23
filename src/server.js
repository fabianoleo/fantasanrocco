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

// Magic bytes check sincrono — no dipendenze esterne, no CVE, no loop infinito
const ALLOWED_MIME = new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif']);
const MIME_TO_EXT  = { 'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif','image/avif':'.avif' };

function checkImageMagicBytes(filePath) {
  try {
    const fd  = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    if (buf[0]===0xFF && buf[1]===0xD8 && buf[2]===0xFF) return 'image/jpeg';
    if (buf.slice(0,8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]))) return 'image/png';
    if (buf.slice(0,4).toString('ascii')==='RIFF' && buf.slice(8,12).toString('ascii')==='WEBP') return 'image/webp';
    if (buf.slice(0,6).toString('ascii')==='GIF87a' || buf.slice(0,6).toString('ascii')==='GIF89a') return 'image/gif';
    // AVIF: ftyp box (offset 4) contiene 'avif' o 'avis'
    if (buf.slice(4,8).toString('ascii')==='ftyp' && (buf.slice(8,12).toString('ascii').startsWith('avif') || buf.slice(8,12).toString('ascii').startsWith('avis'))) return 'image/avif';
    return null;
  } catch { return null; }
}

const { db, DATA_DIR, UPLOADS_DIR, AVATARS_DIR } = require('./db');
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

// Helper icone SVG disponibile in tutte le view: <%- icon('flame') %>
app.locals.icon = require('./icons').icon;

// Helper iniziali: dal nome/nickname ricava 1-2 lettere per l'avatar fallback
app.locals.initials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
};

// Dietro Cloudflare Tunnel / ngrok: fidati dell'header del proxy così
// req.protocol diventa "https" e i link generati (es. reset password) sono corretti.
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
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: SESSION_SECRET mancante in produzione. Arresto.');
    process.exit(1);
  }
  console.warn('⚠️  SESSION_SECRET non impostato: usane uno nel file .env!');
}
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
app.use(session({
  store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 900000 } }),
  name: 'fsr.s2',
  secret: process.env.SESSION_SECRET || 'dev-secret-cambiami',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: SECURE_COOKIES,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 giorni
  },
}));

// Cancella il vecchio cookie fsr.sid (SameSite=none) se ancora presente nel browser
app.use((req, res, next) => {
  if (req.headers.cookie && req.headers.cookie.includes('fsr.sid=')) {
    res.setHeader('Set-Cookie', 'fsr.sid=; Path=/; Max-Age=0; HttpOnly; SameSite=lax');
  }
  next();
});

// --- Flash messages + utente corrente --------------------------------------
app.use((req, res, next) => {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.path = req.path;
  next();
});
app.use(auth.loadCurrentUser);

// Saldo punti dell'utente loggato, disponibile in ogni view (barra in alto).
// userPoints è una function declaration (hoisted) → richiamabile qui a runtime.
app.use((req, res, next) => {
  res.locals.userBalance = req.currentUser ? userPoints(req.currentUser.id) : null;
  next();
});

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

// --- Utenti online — ping-based (affidabile su mobile + Cloudflare) --------
// Il client manda GET /api/online/ping?uid=UUID ogni 8s.
// UUID generato in localStorage: stabile attraverso login/logout/refresh.
const _lastPing = new Map(); // uid → timestamp
const _sseClients = new Set();
const PING_TTL = 18_000; // 3 ping mancati = offline
const MAX_ONLINE_ENTRIES = 5000;

function _onlineCount() {
  const cutoff = Date.now() - PING_TTL;
  return [..._lastPing.values()].filter(t => t >= cutoff).length;
}

function _broadcastCount() {
  const msg = `data: ${JSON.stringify({ count: _onlineCount() })}\n\n`;
  for (const r of _sseClients) { try { r.write(msg); } catch {} }
}

// Ping: il client manda il suo UUID stabile (localStorage) ogni 8s
app.get('/api/online/ping', (req, res) => {
  const uid = typeof req.query.uid === 'string' ? req.query.uid.slice(0, 64) : null;
  if (uid) {
    if (!_lastPing.has(uid) && _lastPing.size >= MAX_ONLINE_ENTRIES) {
      return res.json({ ok: true });
    }
    const prev = _onlineCount();
    _lastPing.set(uid, Date.now());
    if (_onlineCount() !== prev) _broadcastCount();
  }
  res.json({ ok: true });
});

// SSE: canale push per ricevere aggiornamenti in tempo reale
app.get('/api/online/stream', (req, res) => {
  if (req.socket) req.socket.setNoDelay(true);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  _sseClients.add(res);
  try { res.write(`retry: 2000\ndata: ${JSON.stringify({ count: _onlineCount() })}\n\n`); } catch {}
  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 20_000);
  req.on('close', () => { _sseClients.delete(res); clearInterval(hb); });
});

// Pulizia ogni 10s: rimuove chi non pinga più e aggiorna il count
setInterval(() => {
  const cutoff = Date.now() - PING_TTL;
  let changed = false;
  for (const [id, t] of _lastPing) {
    if (t < cutoff) { _lastPing.delete(id); changed = true; }
  }
  if (changed) _broadcastCount();
}, 5_000);

app.get('/api/online', (req, res) => { res.json({ count: _onlineCount() }); });

// Debug: mostra le entry attive nel map (solo admin/staff)
app.get('/api/online/debug', auth.requireStaff, (req, res) => {
  const now = Date.now();
  const entries = [..._lastPing.entries()].map(([uid, t]) => ({
    uid: uid.slice(0, 8) + '…',
    secondsAgo: Math.round((now - t) / 1000),
    alive: (now - t) < PING_TTL,
  }));
  res.json({ count: _onlineCount(), entries });
});

// =========================================================================
//  RADIO «Onde di San Rocco» — stazione condivisa
//  Tutti ascoltano la STESSA canzone alla STESSA posizione: una timeline
//  server-authoritative che cicla la playlist all'infinito. Niente skip:
//  solo "sintonizzati / stop" lato client.
// =========================================================================
// ► COME AGGIUNGERE LE CANZONI: metti i file audio in public/radio/ e aggiungi
//   una voce qui sotto con src, title, (cover opzionale) e duration in secondi.
//   La durata si può leggere con:  afinfo public/radio/tuofile.mp3
const RADIO_PLAYLIST = [
  { src: "/radio/lda-aka-7even-andamento-lento-visual-video-ft-tullio-de-pisc.mp3", title: "LDA, Aka 7even — Andamento Lento ft. Tullio De Piscopo", cover: "/images/artisti/lda-aka7even.jpg", duration: 212 },
  { src: "/radio/lda-aka-7even-poesie-clandestine-official-video-sanremo-2026.mp3", title: "LDA, Aka 7even — Poesie Clandestine", cover: "/images/artisti/lda-aka7even.jpg", duration: 209 },
  { src: "/radio/mazzariello-amarsi-per-lavoro-sanremo-giovani-2025.mp3", title: "Mazzariello — Amarsi Per Lavoro", cover: "/images/artisti/mazzariello.jpg", duration: 185 },
  { src: "/radio/mazzariello-atti-estremi-in-luogo-pubblico-official-video-1.mp3", title: "Mazzariello — Atti Estremi In Luogo Pubblico", cover: "/images/artisti/mazzariello.jpg", duration: 171 },
  { src: "/radio/mazzariello-blindati-visual-video.mp3", title: "Mazzariello — Blindati", cover: "/images/artisti/mazzariello.jpg", duration: 122 },
  { src: "/radio/mazzariello-bombe-carta-visual-video.mp3", title: "Mazzariello — Bombe Carta", cover: "/images/artisti/mazzariello.jpg", duration: 184 },
  { src: "/radio/mazzariello-finestre-verdi-visual-video.mp3", title: "Mazzariello — Finestre Verdi", cover: "/images/artisti/mazzariello.jpg", duration: 205 },
  { src: "/radio/mazzariello-manifestazione-d-amore-official-video-sanremo-20.mp3", title: "Mazzariello — Manifestazione D'amore", cover: "/images/artisti/mazzariello.jpg", duration: 191 },
  { src: "/radio/mazzariello-millisecondi-visual-video.mp3", title: "Mazzariello — Millisecondi", cover: "/images/artisti/mazzariello.jpg", duration: 185 },
  { src: "/radio/mazzariello-nostalgia-karaoke-lyric-video.mp3", title: "Mazzariello — Nostalgia & Karaoke", cover: "/images/artisti/mazzariello.jpg", duration: 217 },
  { src: "/radio/mazzariello-orchidee-visual-video.mp3", title: "Mazzariello — Orchidee", cover: "/images/artisti/mazzariello.jpg", duration: 183 },
  { src: "/radio/mazzariello-per-un-milione-di-euro-official-video.mp3", title: "Mazzariello — Per Un Milione Di Euro", cover: "/images/artisti/mazzariello.jpg", duration: 180 },
  { src: "/radio/serena-brancale-levante-delia-al-mio-paese-testolyrics.mp3", title: "Serena Brancale, Levante, DELIA — Al Mio Paese", cover: "/images/galleria/palio-fuochi.jpg", duration: 198 },
];
// Riferimento fisso della timeline: la posizione "in onda" si calcola da qui.
const RADIO_EPOCH = Date.UTC(2026, 0, 1, 0, 0, 0);

// Cosa è "in onda" adesso (indice canzone + offset in secondi), uguale per tutti.
app.get('/api/radio/now', (req, res) => {
  if (!RADIO_PLAYLIST.length) return res.json({ ok: true, playing: false });
  const total = RADIO_PLAYLIST.reduce((a, t) => a + (t.duration || 0), 0);
  if (total <= 0) return res.json({ ok: true, playing: false });
  let elapsed = (((Date.now() - RADIO_EPOCH) / 1000) % total + total) % total;
  let idx = 0;
  for (let i = 0; i < RADIO_PLAYLIST.length; i++) {
    if (elapsed < RADIO_PLAYLIST[i].duration) { idx = i; break; }
    elapsed -= RADIO_PLAYLIST[i].duration;
  }
  const t = RADIO_PLAYLIST[idx];
  res.json({
    ok: true, playing: true,
    index: idx, count: RADIO_PLAYLIST.length,
    src: t.src, title: t.title, cover: t.cover || null,
    offset: elapsed, duration: t.duration,
    serverTime: Date.now(),
  });
});

// Reso disponibile alle view per mostrare/nascondere il player.
app.locals.radioOn = RADIO_PLAYLIST.length > 0;

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

// Upload avatar: stessa validazione, ma salvato nella cartella avatar (pubblica)
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATARS_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().slice(0, 5);
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const avatarUpload = multer({
  storage: avatarStorage,
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
  { file: 'ventagli.webp',          caption: 'I ventagli caricati e pronti al lancio: ogni lamella porta un fuoco, ogni fuoco porta un applauso' },
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
           COALESCE(SUM(CASE WHEN s.status='approved' THEN m.points ELSE 0 END), 0) + u.points_adjust AS points,
           COUNT(CASE WHEN s.status='approved' THEN 1 END) AS done
    FROM users u
    LEFT JOIN submissions s ON s.user_id = u.id
    LEFT JOIN missions m    ON m.id = s.mission_id
    WHERE u.role = 'user'
    GROUP BY u.id
    ORDER BY points DESC, u.created_at ASC
  `).all();
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

// =========================================================================
//  MINI-GIOCO  «Corri San Rocco»  — traguardi che danno punti in automatico
// =========================================================================
// Ogni traguardo è una "missione" (game_key) sbloccata raggiungendo un
// punteggio nel gioco. Al raggiungimento il server inserisce una prova già
// approvata → i punti entrano in classifica come le altre missioni.
const GAME_ACHIEVEMENTS = [
  // ── Punteggio · base (accessibili a tutti) ───────────────────────
  { key: 'g-run',   metric: 'score', threshold: 1,     points: 10,   title: 'Prima corsa',                 desc: 'Completa la tua prima partita a «Corri San Rocco».' },
  { key: 'g-50',    metric: 'score', threshold: 50,    points: 15,   title: 'In cammino',                  desc: 'Raggiungi 50 punti in una partita.' },
  { key: 'g-120',   metric: 'score', threshold: 120,   points: 25,   title: 'Pellegrino instancabile',     desc: 'Raggiungi 120 punti in una partita.' },
  { key: 'g-250',   metric: 'score', threshold: 250,   points: 40,   title: 'Col cane fino ai fuochi',      desc: 'Raggiungi 250 punti in una partita.' },
  { key: 'g-400',   metric: 'score', threshold: 400,   points: 60,   title: 'Leggenda di Siano',           desc: 'Raggiungi 400 punti in una partita.' },
  // ── Punteggio · avanzati (per chi va lontano) ───────────────────
  { key: 'g-600',   metric: 'score', threshold: 600,   points: 80,   title: 'Devoto tra i devoti',         desc: 'Raggiungi 600 punti in una partita.' },
  { key: 'g-850',   metric: 'score', threshold: 850,   points: 100,  title: 'Cavaliere di San Rocco',      desc: 'Raggiungi 850 punti in una partita.' },
  { key: 'g-1100',  metric: 'score', threshold: 1100,  points: 130,  title: 'Guardiano della processione', desc: 'Raggiungi 1100 punti in una partita.' },
  { key: 'g-1500',  metric: 'score', threshold: 1500,  points: 170,  title: 'Il Santo corre ancora',       desc: 'Raggiungi 1500 punti in una partita.' },
  { key: 'g-2000',  metric: 'score', threshold: 2000,  points: 220,  title: 'Immortale come San Rocco',    desc: 'Raggiungi 2000 punti in una partita.' },
  // ── Punteggio · leggendari (fino a 15.000) ──────────────────────
  { key: 'g-3000',  metric: 'score', threshold: 3000,  points: 290,  title: 'Maratoneta della festa',      desc: 'Raggiungi 3.000 punti in una partita.' },
  { key: 'g-4500',  metric: 'score', threshold: 4500,  points: 370,  title: 'Veglia infinita',             desc: 'Raggiungi 4.500 punti in una partita.' },
  { key: 'g-6000',  metric: 'score', threshold: 6000,  points: 470,  title: 'Patrono dei pellegrini',      desc: 'Raggiungi 6.000 punti in una partita.' },
  { key: 'g-8000',  metric: 'score', threshold: 8000,  points: 590,  title: 'Miracolo di Siano',           desc: 'Raggiungi 8.000 punti in una partita.' },
  { key: 'g-10000', metric: 'score', threshold: 10000, points: 740,  title: 'Santo tra i santi',           desc: 'Raggiungi 10.000 punti in una partita.' },
  { key: 'g-12500', metric: 'score', threshold: 12500, points: 920,  title: 'Eterno camminatore',          desc: 'Raggiungi 12.500 punti in una partita.' },
  { key: 'g-15000', metric: 'score', threshold: 15000, points: 1200, title: 'Mito di San Rocco',           desc: 'Raggiungi 15.000 punti in una partita. Sei inarrestabile.' },
  // ── Partite giocate (più giochi, più punti) ─────────────────────
  { key: 'gp-3',    metric: 'plays', threshold: 3,     points: 15,   title: 'Ci ho preso gusto',           desc: 'Gioca 3 partite a «Corri San Rocco».' },
  { key: 'gp-8',    metric: 'plays', threshold: 8,     points: 25,   title: 'Habitué del cortile',         desc: 'Gioca 8 partite.' },
  { key: 'gp-20',   metric: 'plays', threshold: 20,    points: 45,   title: 'Cliente fisso',               desc: 'Gioca 20 partite.' },
  { key: 'gp-40',   metric: 'plays', threshold: 40,    points: 70,   title: 'Veterano del distributore',   desc: 'Gioca 40 partite.' },
  { key: 'gp-75',   metric: 'plays', threshold: 75,    points: 110,  title: 'Mai una pausa',               desc: 'Gioca 75 partite.' },
  { key: 'gp-150',  metric: 'plays', threshold: 150,   points: 170,  title: 'Inchiodato allo schermo',     desc: 'Gioca 150 partite. Ma quanto giochi?' },
];

// Crea/aggiorna le missioni del gioco allo startup (idempotente).
function ensureGameMissions() {
  const get = db.prepare('SELECT id FROM missions WHERE game_key = ?');
  const ins = db.prepare(`INSERT INTO missions (title, description, points, requires_photo, repeatable, archived, game_key)
                          VALUES (?, ?, ?, 0, 0, 0, ?)`);
  const upd = db.prepare('UPDATE missions SET title = ?, description = ?, points = ? WHERE game_key = ?');
  for (const a of GAME_ACHIEVEMENTS) {
    if (get.get(a.key)) upd.run(a.title, a.desc, a.points, a.key);
    else ins.run(a.title, a.desc, a.points, a.key);
  }
}
ensureGameMissions();

// È un traguardo già conquistato dall'utente?
function gameMissionId(key) {
  const m = db.prepare('SELECT id FROM missions WHERE game_key = ?').get(key);
  return m ? m.id : null;
}

app.get('/classifica', (req, res) => {
  res.render('leaderboard', {
    title: 'Classifica',
    rows: leaderboardRows(),
    gameRows: gameLeaderboardRows(),
    currentUserId: req.currentUser?.id ?? null,
  });
});

// =========================================================================
//  AUTENTICAZIONE (registrazione aperta: nickname + email + password)
// =========================================================================
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.body?.nickname || '').toLowerCase().trim() || req.ip,
});
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5,  standardHeaders: true, legacyHeaders: false });
const registerLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
const gameLimiter = rateLimit({ windowMs: 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });
const slotLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
const wheelLimiter = rateLimit({ windowMs: 60 * 1000, max: 12, standardHeaders: true, legacyHeaders: false });
app.use(globalLimiter);

// --- Registrazione aperta --------------------------------------------------
app.get('/registrati', (req, res) => {
  if (req.currentUser) return res.redirect('/missioni');
  res.render('register', { title: 'Registrati' });
});

app.post('/registrati', registerLimiter, (req, res) => {
  if (req.currentUser) return res.redirect('/missioni');

  const nickname = (req.body.nickname || '').trim();
  const email    = (req.body.email || '').trim().toLowerCase() || null;
  const password = req.body.password || '';

  if (nickname.length < 2 || nickname.length > 24) {
    flash(req, 'error', 'Il nickname deve avere tra 2 e 24 caratteri.');
    return res.redirect('/registrati');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    flash(req, 'error', 'Inserisci un indirizzo email valido.');
    return res.redirect('/registrati');
  }
  if (password.length < 8) {
    flash(req, 'error', 'La password deve avere almeno 8 caratteri.');
    return res.redirect('/registrati');
  }

  const existsNick = db.prepare('SELECT id FROM users WHERE nickname = ?').get(nickname);
  if (existsNick) {
    flash(req, 'error', 'Nickname già in uso, scegline un altro.');
    return res.redirect('/registrati');
  }
  const existsEmail = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
  if (existsEmail) {
    flash(req, 'error', 'Email già registrata. Vai su Accedi o recupera la password.');
    return res.redirect('/registrati');
  }

  db.prepare('INSERT INTO users (nickname, email, password_hash) VALUES (?, ?, ?)')
    .run(nickname, email, auth.hashPassword(password));

  res.render('register-done', { title: 'Registrazione completata', nickname });
});

app.get('/login', (req, res) => res.render('login', { title: 'Accedi' }));

// Hash sentinella: usato se il nickname non esiste, per mantenere tempo costante
const BCRYPT_SENTINEL = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

app.post('/login', loginLimiter, (req, res) => {
  const nickname = (req.body.nickname || '').trim();
  const password = req.body.password || '';
  const user = db.prepare('SELECT * FROM users WHERE nickname = ?').get(nickname);
  // Esegue sempre bcrypt (tempo costante) — previene timing oracle anche se il nickname non esiste
  const passwordOk = auth.verifyPassword(password, user?.password_hash || BCRYPT_SENTINEL);
  if (!user || !passwordOk) {
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

// ── Mini-gioco «Corri San Rocco» ──────────────────────────────────────────
app.get('/gioco', (req, res) => {
  const achievements = GAME_ACHIEVEMENTS.map((a) => {
    let done = false;
    if (req.currentUser) {
      const mid = gameMissionId(a.key);
      done = !!(mid && db.prepare("SELECT 1 FROM submissions WHERE user_id = ? AND mission_id = ? AND status = 'approved'")
        .get(req.currentUser.id, mid));
    }
    return { title: a.title, desc: a.desc, points: a.points, threshold: a.threshold, metric: a.metric, done };
  });
  res.render('gioco', {
    title: 'Corri San Rocco',
    achievements,
    best: req.currentUser ? (req.currentUser.game_best || 0) : 0,
    plays: req.currentUser ? (req.currentUser.game_plays || 0) : 0,
  });
});

// Report del punteggio di fine partita: aggiorna il record e assegna i
// traguardi non ancora conquistati (solo loggati). Idempotente.
app.post('/gioco/punteggio', auth.requireLogin, gameLimiter, verifyCsrf, (req, res) => {
  const score = Math.max(0, Math.min(100000, parseInt(req.body.score, 10) || 0));
  const awarded = [];
  // Ogni report di fine partita conta come una partita giocata
  const plays = (req.currentUser.game_plays || 0) + 1;
  db.transaction(() => {
    if (score > (req.currentUser.game_best || 0)) {
      db.prepare('UPDATE users SET game_best = ? WHERE id = ?').run(score, req.currentUser.id);
    }
    db.prepare('UPDATE users SET game_plays = ? WHERE id = ?').run(plays, req.currentUser.id);
    for (const a of GAME_ACHIEVEMENTS) {
      const value = a.metric === 'plays' ? plays : score;
      if (value < a.threshold) continue;
      const mid = gameMissionId(a.key);
      if (!mid) continue;
      const has = db.prepare("SELECT 1 FROM submissions WHERE user_id = ? AND mission_id = ? AND status = 'approved'")
        .get(req.currentUser.id, mid);
      if (has) continue;
      db.prepare(`INSERT INTO submissions (user_id, mission_id, status, note, review_note)
                  VALUES (?, ?, 'approved', 'mini-gioco', 'auto')`).run(req.currentUser.id, mid);
      awarded.push({ title: a.title, points: a.points });
    }
  })();
  const best = Math.max(score, req.currentUser.game_best || 0);
  res.json({ ok: true, best, plays, awarded });
});

// =========================================================================
//  RUOTA DELLA FORTUNA  (gratis 1×/giorno) + SLOT «Tombola di San Rocco»
//  Stessa valuta della classifica: i premi modificano users.points_adjust.
//  Tutta la casualità è SOLO lato server (mai fidarsi del client).
// =========================================================================
function cryptoRandom() {                       // [0,1) da CSPRNG
  return crypto.randomBytes(4).readUInt32BE(0) / 0x100000000;
}
function weightedPick(items) {                  // items: [{ ..., weight }]
  const tot = items.reduce((a, it) => a + it.weight, 0);
  let r = cryptoRandom() * tot;
  for (const it of items) { if ((r -= it.weight) < 0) return it; }
  return items[items.length - 1];
}
// Data odierna nel fuso orario ITALIANO (Europe/Rome) → il limite della ruota
// si resetta a mezzanotte italiana (gestisce anche l'ora legale). Es: giro le
// 23:59 e posso rigirare 2 minuti dopo, perché è un nuovo giorno.
function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
}

// ── Ruota: spicchi con premi in punti. Più alto il premio, più raro. ──────
// L'ordine è anche quello visivo degli spicchi (0 in alto, orario).
const WHEEL_PRIZES = [
  { points: 10,  weight: 250, label: '10' },
  { points: 75,  weight: 40,  label: '75' },
  { points: 25,  weight: 130, label: '25' },
  { points: 5,   weight: 300, label: '5' },
  { points: 150, weight: 17,  label: '150' },
  { points: 15,  weight: 180, label: '15' },
  { points: 300, weight: 3,   label: 'JACKPOT 300', jackpot: true },
  { points: 40,  weight: 80,  label: '40' },
];

app.get('/ruota', auth.requireLogin, (req, res) => {
  res.render('ruota', {
    title: 'Ruota della Fortuna',
    prizes: WHEEL_PRIZES,
    balance: userPoints(req.currentUser.id),
    canSpin: req.currentUser.last_wheel_day !== todayStr(),
  });
});

app.post('/ruota/gira', auth.requireLogin, wheelLimiter, (req, res) => {
  const today = todayStr();
  let result = null;
  const ok = db.transaction(() => {
    // Ri-legge l'utente DENTRO la transazione → niente doppio giro per race condition
    const u = db.prepare('SELECT last_wheel_day FROM users WHERE id = ?').get(req.currentUser.id);
    if (u && u.last_wheel_day === today) return false;
    const pick = weightedPick(WHEEL_PRIZES);
    const idx = WHEEL_PRIZES.indexOf(pick);
    db.prepare('UPDATE users SET points_adjust = points_adjust + ?, last_wheel_day = ? WHERE id = ?')
      .run(pick.points, today, req.currentUser.id);
    result = { index: idx, points: pick.points, jackpot: !!pick.jackpot };
    return true;
  })();
  if (!ok) return res.status(429).json({ ok: false, error: 'already', message: 'Hai già girato oggi. Torna domani!' });
  res.json({ ok: true, ...result, balance: userPoints(req.currentUser.id) });
});

// ── Slot: 3 rulli, simboli pesati (San Rocco il più raro/forte). ─────────
// RTP ≈ 88,6% → vantaggio del banco ~11,4%: a lungo andare il giocatore perde.
const SLOT_SYMBOLS = [
  { key: 'ciliegia', weight: 14 },
  { key: 'percoca',  weight: 10 },
  { key: 'vino',     weight: 7  },
  { key: 'braciola', weight: 5  },
  { key: 'fuoco',    weight: 3  },
  { key: 'sanrocco', weight: 1  },
];
const SLOT_TRIPLE = { ciliegia: 3, percoca: 6, vino: 12, braciola: 25, fuoco: 55, sanrocco: 188 };
const SLOT_PAIR   = { ciliegia: 0, percoca: 1, vino: 1.5, braciola: 3, fuoco: 8, sanrocco: 12 };
const SLOT_BETS   = [10, 20, 50, 100];

// Valuta una giocata (3 simboli) → moltiplicatore sulla puntata + descrizione.
function evalSlot(reels) {
  const cnt = {};
  reels.forEach((s) => { cnt[s] = (cnt[s] || 0) + 1; });
  for (const k in cnt) {
    if (cnt[k] === 3) {
      return { mult: SLOT_TRIPLE[k], kind: 'tris', sym: k, jackpot: k === 'sanrocco' };
    }
  }
  let best = 0, bestSym = null;
  for (const k in cnt) {
    if (cnt[k] === 2 && (SLOT_PAIR[k] || 0) > best) { best = SLOT_PAIR[k]; bestSym = k; }
  }
  if (best > 0) return { mult: best, kind: 'coppia', sym: bestSym, jackpot: false };
  return { mult: 0, kind: 'niente', sym: null, jackpot: false };
}

app.get('/slot', auth.requireLogin, (req, res) => {
  res.render('slot', {
    title: 'Slot di San Rocco',
    symbols: SLOT_SYMBOLS.map((s) => s.key),
    bets: SLOT_BETS,
    triple: SLOT_TRIPLE,
    pair: SLOT_PAIR,
    balance: userPoints(req.currentUser.id),
  });
});

app.post('/slot/gira', auth.requireLogin, slotLimiter, (req, res) => {
  const bet = parseInt(req.body.bet, 10);
  if (!SLOT_BETS.includes(bet)) {
    return res.status(400).json({ ok: false, error: 'bet', message: 'Puntata non valida.' });
  }
  let out = null;
  const ok = db.transaction(() => {
    const balance = userPoints(req.currentUser.id);
    if (balance < bet) return false;                       // non puoi puntare più di quanto hai
    const reels = [weightedPick(SLOT_SYMBOLS).key, weightedPick(SLOT_SYMBOLS).key, weightedPick(SLOT_SYMBOLS).key];
    const r = evalSlot(reels);
    const payout = Math.floor(r.mult * bet);               // vincita lorda (puntata inclusa)
    const net = payout - bet;                              // effetto sul saldo
    db.prepare('UPDATE users SET points_adjust = points_adjust + ? WHERE id = ?').run(net, req.currentUser.id);
    out = { reels, payout, net, win: payout > 0, kind: r.kind, sym: r.sym, jackpot: r.jackpot };
    return true;
  })();
  if (!ok) return res.status(400).json({ ok: false, error: 'funds', message: 'Punti insufficienti per questa puntata.' });
  res.json({ ok: true, bet, ...out, balance: userPoints(req.currentUser.id) });
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

  const baseUrl = process.env.APP_URL && !process.env.APP_URL.includes('localhost')
    ? process.env.APP_URL.replace(/\/$/, '')
    : `${req.protocol}://${req.get('host')}`;
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
    }).then((info) => {
      console.log(`[EMAIL] Reset inviato a ${user.email} — messageId: ${info.messageId}`);
    }).catch((err) => {
      console.error(`[EMAIL] ERRORE invio reset a ${user.email}:`, err.message, err.responseCode || '');
    });
  } else {
    // Modalità sviluppo: link visibile solo in console
    console.log(`[DEV] Reset link generato per user_id=${user.id} (invia email disabilitata — vedi .env)`);
    if (process.env.NODE_ENV !== 'production') {
      flash(req, 'success', `[DEV] Reset link in console (non in UI per sicurezza).`);
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
  const missions = db.prepare('SELECT * FROM missions WHERE archived = 0 AND game_key IS NULL ORDER BY points DESC, id ASC').all();
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
        ? true
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
    ? true
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
    // Verifica magic bytes (sincrona — nessuna dipendenza esterna, nessun CVE)
    if (req.file) {
      const mime = checkImageMagicBytes(path.join(UPLOADS_DIR, req.file.filename));
      if (!mime || !ALLOWED_MIME.has(mime)) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        flash(req, 'error', 'Formato file non ammesso. Carica solo immagini (JPEG, PNG, WebP, GIF, AVIF).');
        return res.redirect(`/missioni/${m.id}`);
      }
      // Rinomina il file con l'estensione corretta derivata dal contenuto reale
      const correctExt = MIME_TO_EXT[mime] || '.jpg';
      const oldPath = path.join(UPLOADS_DIR, req.file.filename);
      const safeName = req.file.filename.replace(/\.[^.]+$/, correctExt);
      const newPath = path.join(UPLOADS_DIR, safeName);
      try { fs.renameSync(oldPath, newPath); req.file.filename = safeName; } catch {}
    }
    if (!isMissionActiveNow(m)) {
      flash(req, 'error', 'Questa missione non è attiva in questo momento.');
      return res.redirect(`/missioni/${m.id}`);
    }
    // Foto obbligatoria?
    if (m.requires_photo && !req.file) {
      flash(req, 'error', 'Questa missione richiede una foto come prova.');
      return res.redirect(`/missioni/${m.id}`);
    }
    // SELECT + INSERT atomico in transazione: previene doppio invio per race condition
    let inserted;
    try {
      inserted = db.transaction(() => {
        const statuses = db.prepare('SELECT status FROM submissions WHERE user_id = ? AND mission_id = ?')
          .all(req.currentUser.id, m.id).map((r) => r.status);
        const blocked = m.repeatable
          ? false
          : (statuses.includes('pending') || statuses.includes('approved'));
        if (blocked) return false;
        db.prepare('INSERT INTO submissions (user_id, mission_id, photo_path, note) VALUES (?, ?, ?, ?)')
          .run(req.currentUser.id, m.id, req.file ? req.file.filename : null, (req.body.note || '').trim());
        return true;
      })();
    } catch (e) {
      if (req.file) fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
      throw e;
    }
    if (!inserted) {
      if (req.file) fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
      flash(req, 'error', 'Hai già inviato questa missione (in attesa o approvata).');
      return res.redirect(`/missioni/${m.id}`);
    }
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
  const total = userPoints(req.currentUser.id);
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

// Foto profilo (avatar): carica una nuova immagine. Se assente → iniziali.
app.post('/profilo/avatar', auth.requireLogin, (req, res) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      flash(req, 'error', err.message || 'Errore nel caricamento della foto.');
      return res.redirect('/profilo');
    }
    // CSRF check per multipart (body disponibile solo dopo multer)
    const csrfToken = req.body._csrf || '';
    if (!csrfToken || csrfToken !== req.session.csrfToken) {
      if (req.file) fs.unlink(path.join(AVATARS_DIR, req.file.filename), () => {});
      return res.status(403).render('error', { title: 'Errore di sicurezza', message: 'Token non valido. Ricarica la pagina.' });
    }
    if (!req.file) {
      flash(req, 'error', 'Seleziona un\'immagine da caricare.');
      return res.redirect('/profilo');
    }
    // Verifica magic bytes: deve essere davvero un'immagine
    const mime = checkImageMagicBytes(path.join(AVATARS_DIR, req.file.filename));
    if (!mime || !ALLOWED_MIME.has(mime)) {
      fs.unlink(path.join(AVATARS_DIR, req.file.filename), () => {});
      flash(req, 'error', 'Formato non ammesso. Carica un\'immagine (JPEG, PNG, WebP, GIF, AVIF).');
      return res.redirect('/profilo');
    }
    // Rinomina con l'estensione corretta derivata dal contenuto reale
    const correctExt = MIME_TO_EXT[mime] || '.jpg';
    const safeName = req.file.filename.replace(/\.[^.]+$/, correctExt);
    try { fs.renameSync(path.join(AVATARS_DIR, req.file.filename), path.join(AVATARS_DIR, safeName)); } catch {}
    // Rimuovi la vecchia foto profilo, se presente
    const old = req.currentUser.avatar_path;
    if (old) fs.unlink(path.join(AVATARS_DIR, path.basename(old)), () => {});
    db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(safeName, req.currentUser.id);
    flash(req, 'success', 'Foto profilo aggiornata.');
    res.redirect('/profilo');
  });
});

// Rimuovi la foto profilo → si torna alle iniziali
app.post('/profilo/avatar/rimuovi', auth.requireLogin, verifyCsrf, (req, res) => {
  const old = req.currentUser.avatar_path;
  if (old) fs.unlink(path.join(AVATARS_DIR, path.basename(old)), () => {});
  db.prepare('UPDATE users SET avatar_path = NULL WHERE id = ?').run(req.currentUser.id);
  flash(req, 'success', 'Foto profilo rimossa. Ora mostri le tue iniziali.');
  res.redirect('/profilo');
});

// Avatar serviti pubblicamente (non sono dati sensibili come le foto-prova)
app.get('/avatar/:file', (req, res) => {
  const safe = path.basename(req.params.file);
  const full = path.join(AVATARS_DIR, safe);
  if (!fs.existsSync(full)) return res.status(404).send('File non trovato');
  res.sendFile(full);
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
    ORDER BY u.nickname ASC, s.created_at ASC
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
  res.render('admin', { title: 'Admin', missions, users });
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
  if ((req.body.conferma || '').trim().toUpperCase() !== 'RESET') {
    flash(req, 'error', 'Conferma non corretta. Scrivi RESET nel campo per procedere.');
    return res.redirect('/admin');
  }
  // Re-autenticazione: verifica la password dell'admin prima di distruggere i dati
  if (!auth.verifyPassword(req.body.admin_password || '', req.currentUser.password_hash)) {
    flash(req, 'error', 'Password admin errata. Reset annullato.');
    return res.redirect('/admin');
  }
  db.transaction(() => {
    db.prepare('DELETE FROM submissions').run();
    db.prepare("DELETE FROM users WHERE role != 'admin'").run();
  })();
  flash(req, 'success', 'Gioco resettato: utenti e prove eliminati. Gli admin sono rimasti.');
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
