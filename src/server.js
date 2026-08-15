// ---------------------------------------------------------------------------
// server.js — Applicazione FantaSanRocco (Express + EJS + SQLite).
// Tutte le rotte sono qui, divise in sezioni commentate per ritrovarle facilmente.
// ---------------------------------------------------------------------------
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { authenticator } = require('otplib');
const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const expressLayouts = require('express-ejs-layouts');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const multer = require('multer');

const nodemailer = require('nodemailer');

// Impronte delle foto e controllo dei primi byte: vedi lib/foto.js.
const { PHASH_SOGLIA, photoHash, phashDistanza, checkImageMagicBytes, ALLOWED_MIME, MIME_TO_EXT,
        datiScatto, ridimensiona, STORIA: FOTO_STORIA, AVATAR: FOTO_AVATAR } = require('./lib/foto');

const { db, DATA_DIR, UPLOADS_DIR, AVATARS_DIR, STORIES_DIR, BACKUPS_DIR } = require('./db');
const { placesWithEvents } = require('./dati/luoghi');
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
// Valore di ripiego per la barra di navigazione: la modalità vera la scrive
// res.locals a ogni richiesta, ma la pagina d'errore del CSRF viene resa
// PRIMA di quel middleware, e senza questa riga la barra cercherebbe una
// variabile che non esiste e farebbe cadere anche la pagina d'errore.
app.locals.soloIscrizioni = false;
// Disegni dei simboli della slot: helper globale come icon(), perche' una
// funzione definita dentro un partial EJS non esce da quel partial.
app.locals.simboloSlot = require('./giochi/slot-simboli').simboloSlot;

// Rarità: nel DB il titolo è salvato come "🔵 Primo Cittadino", cioè con
// l'emoji-pallino davanti. Qui la stacco dal nome così le view possono
// mostrarla come etichetta a sé ("BONUS · Primo Cittadino" + chip rarità).
const RARITIES = {
  '⚪': { key: 'comune',       label: 'Comune' },
  '🟢': { key: 'non-comune',   label: 'Non comune' },
  '🔵': { key: 'rara',         label: 'Rara' },
  '🟣': { key: 'epica',        label: 'Epica' },
  '🟠': { key: 'leggendaria',  label: 'Leggendaria' },
};
function missionParts(title) {
  const t = String(title || '').trim();
  for (const [emoji, r] of Object.entries(RARITIES)) {
    if (t.startsWith(emoji)) return { emoji, key: r.key, label: r.label, name: t.slice(emoji.length).trim() };
  }
  return { emoji: '', key: '', label: '', name: t };
}
app.locals.missionParts = missionParts;

// I testi delle missioni sono scritti a mano e possono contenere un indirizzo
// (la donazione per il Malawi, per esempio). Renderlo cliccabile evita che
// qualcuno debba ricopiarselo a mano dal telefono.
//
// Si ESCAPA PRIMA e si cercano i link DOPO, mai il contrario: la descrizione
// arriva dal pannello admin, e con l'ordine invertito basterebbe scriverci
// dentro un tag per farlo eseguire a tutti quelli che aprono la pagina.
// Per lo stesso motivo qui si costruisce solo <a href>, e niente altro.
//
// La punteggiatura finale resta fuori dal link: "vai su https://x.it." non
// deve produrre un indirizzo che finisce col punto, che poi non si apre.
app.locals.testoConLink = (testo) => escapeHtml(testo || '').replace(
  /(https?:\/\/[^\s<]+)/g,
  (url) => {
    const coda = url.match(/[.,;:!?)\]]+$/);
    const pulito = coda ? url.slice(0, -coda[0].length) : url;
    return `<a href="${pulito}" target="_blank" rel="noopener noreferrer">${pulito}</a>`
      + (coda ? coda[0] : '');
  },
);

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
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.bunny.net'],
      fontSrc:        ["'self'", 'https://fonts.bunny.net'],
      imgSrc:         ["'self'", 'data:', 'blob:', 'https://*.basemaps.cartocdn.com'],
      connectSrc:     ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc:      ["'none'"],
      baseUri:        ["'self'"],
      formAction:     ["'self'"],
    },
  },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
}));
// Compressione gzip/brotli di HTML, CSS e JS: style.css passa da ~180 KB a
// ~25 KB. Immagini e audio sono già compressi di loro e il filtro di default
// li salta. Lo stream SSE degli utenti online va escluso a mano: il
// compressore bufferizza la risposta e gli eventi arriverebbero in ritardo.
app.use(compression({
  filter: (req, res) => {
    if (req.path === '/api/online/stream') return false;
    return compression.filter(req, res);
  },
}));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(express.json({ limit: '16kb' }));   // API JSON (es. iscrizione notifiche push)

// Statici con cache differenziata. I CSS/JS nostri hanno il numero di
// versione nell'URL (style.css?v=85) e i vendor non cambiano mai: possono
// stare in cache un anno, "immutable" = il browser non richiede nemmeno la
// conferma. sw.js invece NON va mai in cache (deciderebbe lui le cache di
// tutto il resto con una versione vecchia). Immagini e audio: un giorno di
// cache piena + una settimana di "usa intanto la copia vecchia mentre
// controlli" — così un poster sostituito con lo stesso nome si aggiorna.
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders(res, filePath) {
    const base = path.basename(filePath);
    if (base === 'sw.js') {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/\.(css|js|glb|woff2?)$/.test(base)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (base === 'manifest.json') {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    }
  },
}));

// --- Sessioni (persistite su SQLite, sopravvivono ai riavvii) ---------------
if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: SESSION_SECRET mancante in produzione. Arresto.');
    process.exit(1);
  }
  console.warn('⚠️  SESSION_SECRET non impostato: usane uno nel file .env!');
}
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

// URL pubblico per costruire i link nelle email (es. reset password).
//  1) Se APP_URL è configurato e non-localhost → usa quello (produzione, dominio fisso).
//  2) Altrimenti, se la richiesta arriva da un tunnel Cloudflare "usa e getta"
//     (*.trycloudflare.com / *.cfargotunnel.com), usa quell'host: cambia ad ogni
//     avvio del tunnel ma non serve toccare .env. È sicuro perché quell'header
//     lo imposta Cloudflare all'edge (il client non può falsificarlo se il server
//     è raggiungibile solo tramite il tunnel), e accettiamo SOLO domini di tunnel.
//  3) Ripiego: APP_URL (localhost) → i link funzionano solo in locale.
function publicBaseUrl(req) {
  if (process.env.APP_URL && !process.env.APP_URL.includes('localhost')) return APP_URL;
  const xfHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = xfHost || String(req.headers.host || '').trim();
  if (/\.(trycloudflare\.com|cfargotunnel\.com)$/i.test(host)) {
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    return proto + '://' + host;
  }
  return APP_URL;
}

// Notifiche push e bonus da 100 punti: vedi lib/notifiche.js.
const { PUSH_ENABLED, NOTIF_BONUS, reconcileNotifBonus, pushBroadcast, pushToUser } = require('./lib/notifiche');

// Backup del database: vedi lib/backup.js.
const { runBackup, avviaBackupPeriodici } = require('./lib/backup');
// Registro delle azioni dello staff: vedi lib/registro.js.
const { audit, auditSystem } = require('./lib/registro');
avviaBackupPeriodici();


app.use(session({
  store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 900000 } }),
  name: 'fsr.s2',
  secret: process.env.SESSION_SECRET || 'dev-secret-cambiami',
  resave: false,
  saveUninitialized: false,
  rolling: true, // rinnova la scadenza del cookie a ogni richiesta: chi usa l'app non viene sloggato
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

// Le pagine HTML non vanno MAI messe in cache: ogni pagina mostra l'header con
// il nickname (o il pulsante «Accedi»), quindi una copia salvata dal browser o
// dal service worker mostrerebbe lo stato di login com'era al momento del
// salvataggio — è il motivo per cui, riaprendo la PWA, sembrava di essere
// sloggati pur avendo la sessione ancora valida.
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
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
  // Giro gratis della Ruota disponibile oggi? → aura animata sull'icona in barra.
  res.locals.wheelReady = req.currentUser ? (req.currentUser.last_wheel_day !== todayStr()) : false;
  next();
});

// Barra storie (solo pagine HTML per i loggati): calcola le storie attive raggruppate.
// activeStoriesGrouped è una function declaration (hoisted), definita più sotto.
app.use((req, res, next) => {
  res.locals.storiesData = (req.currentUser && req.method === 'GET')
    ? activeStoriesGrouped(req.currentUser)
    : null;
  // Streak giornaliero (popup premio del giorno) — streakStatus è hoisted.
  res.locals.streak = (req.currentUser && req.method === 'GET')
    ? streakStatus(req.currentUser)
    : null;
  next();
});

// --- CSRF protection (synchronizer-token pattern) --------------------------
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  res.locals.vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
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

// --- Modalità solo iscrizioni ---------------------------------------------
// Vedi lib/modalita.js per cosa resta aperto e perché. Il cancello sta QUI,
// dopo il CSRF e prima di ogni rotta: una sola porta invece di un controllo
// dentro ognuna delle sessanta rotte, dove prima o poi se ne dimentica una.
// Dopo il CSRF e non prima perché la pagina di attesa disegna la barra in
// alto, e quella ha bisogno del token per il pulsante di uscita.
app.use((req, res, next) => {
  res.locals.soloIscrizioni = modalita.attiva();
  if (!res.locals.soloIscrizioni) return next();
  // Lo staff non è mai bloccato: deve poter preparare le pagine chiuse.
  if (req.currentUser && (req.currentUser.role === 'admin' || req.currentUser.role === 'moderator')) return next();
  if (modalita.consentito(req.path)) return next();

  // Le chiamate in JavaScript vogliono una risposta che sappiano leggere:
  // servirgli una pagina HTML le farebbe fallire con un errore incomprensibile.
  if (req.method !== 'GET' || req.get('accept')?.includes('application/json')) {
    return res.status(403).json({ ok: false, errore: `Non ancora: si comincia il ${modalita.INIZIO_GIOCO.etichetta}.` });
  }
  return res.status(200).render('chiuso', { title: `Ci vediamo il ${modalita.INIZIO_GIOCO.etichetta}` });
});

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

// Upload storie: salvate nella cartella stories (servite ai soli loggati)
const storyStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, STORIES_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().slice(0, 5);
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const storyUpload = multer({
  storage: storyStorage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Sono ammesse solo immagini.'));
  },
});

// Helper: scrive un flash e prosegue
function flash(req, type, msg) { req.session.flash = { type, msg }; }

// Helper: escape HTML per interpolazioni in contesti HTML (es. corpo email).
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Helper: oggi (ora italiana) è uno dei giorni elencati in `giorni_attivi`?
// La colonna serve alle missioni che valgono a giorni alterni — 13, 14, 15 e
// 17 ma non il 16 — che una sola coppia active_from/active_to non sa dire.
// Senza elenco la risposta è sempre sì, ed è il caso di quasi tutte.
function isGiornoAmmesso(m) {
  if (!m.giorni_attivi) return true;
  const giornoOggi = Number(todayStr().slice(8, 10));
  return String(m.giorni_attivi)
    .split(',')
    .some((g) => Number(g.trim()) === giornoOggi);
}

// Helper: una missione è attiva adesso?
function isMissionActiveNow(m) {
  const now = Date.now();
  if (m.active_from && now < romeStringToDate(m.active_from).getTime()) return false;
  if (m.active_to && now > romeStringToDate(m.active_to).getTime()) return false;
  return isGiornoAmmesso(m);
}

// "Non attiva" ha due significati molto diversi: una sfida del 16 agosto vista
// il 14 è una SORPRESA da non rovinare, una vista il 18 è semplicemente scaduta.
// Solo la prima va nascosta.
function missionState(m) {
  const now = Date.now();
  if (m.active_from && now < romeStringToDate(m.active_from).getTime()) return 'locked';
  if (m.active_to && now > romeStringToDate(m.active_to).getTime()) return 'expired';
  // Giorno di pausa dentro la finestra (il 16, per una missione 13-15 e 17):
  // è 'locked' e non 'expired', perché domani la missione torna disponibile.
  if (!isGiornoAmmesso(m)) return 'locked';
  return 'active';
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
// "2026-08-16 00:00:00" → "16 agosto"
function romeDayLabel(s) {
  const mm = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return mm ? `${Number(mm[3])} ${MESI[Number(mm[2]) - 1]}` : null;
}

// Quando si sblocca una missione bloccata? Di norma è la data di active_from,
// ma per una missione a giorni alterni ferma in un giorno di pausa quella data
// è già passata: lì bisogna dire il prossimo giorno buono dell'elenco.
function missionUnlockLabel(m) {
  const primaDellaFinestra =
    m.active_from && Date.now() < romeStringToDate(m.active_from).getTime();
  if (!primaDellaFinestra && m.giorni_attivi && !isGiornoAmmesso(m)) {
    const oggi = Number(todayStr().slice(8, 10));
    const prossimo = String(m.giorni_attivi)
      .split(',')
      .map((g) => Number(g.trim()))
      .filter((g) => Number.isFinite(g) && g > oggi)
      .sort((a, b) => a - b)[0];
    return prossimo ? `${prossimo} ${MESI[Number(todayStr().slice(5, 7)) - 1]}` : null;
  }
  return romeDayLabel(m.active_from);
}

// Healthcheck: usato da Docker/monitoraggio esterno per sapere se il server
// è vivo E il database risponde davvero (non solo "il processo esiste").
// Targhetta della build: la scrive il Dockerfile in build-info.json (vedi lì
// il perché). Si legge UNA volta all'avvio — /health lo chiama l'healthcheck
// ogni pochi secondi, e un accesso al disco a ogni giro sarebbe sprecato.
// In sviluppo il file non c'è e resta null: si sta guardando il codice sul
// proprio computer, la domanda "quale versione è online" non si pone.
const BUILD_INFO = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build-info.json'), 'utf8'));
  } catch (e) { return null; }
})();

// Dice se l'app è viva E cosa sta girando. La seconda parte serve a rispondere
// in due secondi a "quello che ho appena messo online c'è davvero?" — prima
// l'unico modo era leggere il sorgente della pagina dal telefono, e una build
// fallita in silenzio non si distingueva da una modifica che non si nota.
app.get('/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.status(200).json({
      ok: true,
      commit: BUILD_INFO && BUILD_INFO.commit ? BUILD_INFO.commit.slice(0, 7) : null,
      build: BUILD_INFO ? BUILD_INFO.build : null,
    });
  } catch (e) {
    res.status(503).json({ ok: false });
  }
});

// =========================================================================
//  PAGINE PUBBLICHE
// =========================================================================
app.get('/', (req, res) => {
  const topThree = leaderboardRows().slice(0, 3);
  // I numeri della striscia si contano, non si scrivono a mano: erano fermi a
  // "105 missioni" e "3 premi" mentre le missioni erano diventate 114 e i
  // premi 12. Il conto delle missioni sta nel database perché lo staff può
  // aggiungerne dal pannello, quindi una costante sarebbe sbagliata il giorno
  // dopo. PREMI e PREMI_PODIO sono dichiarati più in basso: qui va bene lo
  // stesso, perché questo codice gira a ogni richiesta, non al caricamento.
  const nMissioni = db.prepare('SELECT COUNT(*) c FROM missions').get().c;
  res.render('home', {
    title: 'FantaSanRocco',
    topThree,
    nMissioni,
    premiPodio: PREMI_PODIO,
    totalePremi: PREMI.length,
  });
});

// I premi stanno in dati/premi.js: e' contenuto che cambia spesso e non ha
// motivo di vivere nel file delle rotte. Vedi la nota li' dentro su perche'
// l'elenco deve restare uno solo.
const {
  PREMI, PREMI_PODIO, PREMI_LISTA, PREMI_GIOCHI, PREMI_TORNEI,
  PREMIO_PER_POSIZIONE, PREMIO_PER_GIOCO,
  NOMI_GIOCHI, ULTIMA_POSIZIONE_PREMIATA,
} = require('./dati/premi');

// Sponsor della barra: elenco e controllo dei PNG presenti stanno in
// dati/sponsor.js. Qui resta solo la pubblicazione alle view.
const slot5 = require('./giochi/slot');
// Ogni movimento di punti passa da qui e lascia la sua riga nel registro:
// vedi lib/punti.js sul perche'.
const punti = require('./lib/punti');
const modalita = require('./lib/modalita');
// Codici invito: chi porta un amico che si iscrive incassa il suo bonus.
const inviti = require('./lib/inviti');
// Email a cui e' vietato reiscriversi: vedi lib/blocco-email.js.
const bloccoEmail = require('./lib/blocco-email');
// La data d'inizio serve a piu' viste (home, pagina di attesa): sta nei
// locals una volta sola, cosi' nessun template la riscrive a mano.
app.locals.inizioGioco = modalita.INIZIO_GIOCO;

// La tabella `invites` non viene piu' creata da src/db.js: il sistema degli
// inviti e' stato tolto quando le iscrizioni sono diventate libere. Ma nei
// database piu' vecchi la tabella e' ancora li', con dentro righe che
// puntano agli utenti con vincolo NO ACTION: se non si sganciano prima, il
// DELETE degli utenti fallisce. Quindi non si puo' ne' toccarla sempre (sui
// database nuovi non esiste e la query esplode) ne' ignorarla sempre (sui
// vecchi il reset si blocca sul vincolo). Si guarda se c'e'.
// Il controllo si fa una volta e si ricorda: la tabella non compare da sola.
let _invitiCiSono = null;
function invitiCiSono() {
  if (_invitiCiSono === null) {
    _invitiCiSono = !!db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'invites'"
    ).get();
  }
  return _invitiCiSono;
}
const { SPONSOR_LOGHI } = require('./dati/sponsor');
app.locals.sponsorLoghi = SPONSOR_LOGHI;

// Gli sponsor scegliibili come padrini di una missione sono SOLO quelli il cui
// PNG esiste davvero: un marchio annunciato ma senza file diventerebbe
// un'immagine rotta sulla card. È anche la lista bianca con cui si valida
// quello che arriva dal pannello — il valore finisce dentro un src, quindi non
// può essere una stringa qualsiasi scritta nella richiesta.
const SPONSOR_PER_MISSIONE = SPONSOR_LOGHI;
const NOME_SPONSOR = Object.fromEntries(SPONSOR_LOGHI.map((s) => [s.file, s.nome]));
app.locals.sponsorPerMissione = SPONSOR_PER_MISSIONE;
// Ripulisce il campo `sponsor` che arriva dal form: o è un file in elenco, o è
// niente. Serve identica alla creazione e alla modifica, quindi sta qui.
function sponsorValido(v) {
  return NOME_SPONSOR[v] ? v : null;
}

// Stemma del Comitato Festa accanto alla riga legale del footer. Stessa
// regola dei loghi sponsor: se il file non c'è la riga resta di solo testo,
// invece di mostrare l'icona di immagine rotta in fondo a ogni pagina.
// Il ?v= serve come per style.css: le immagini restano in cache un giorno,
// e senza questo chi e' gia' passato di qui continuerebbe a scaricare la
// versione vecchia e pesante fino a domani.
app.locals.logoComitato =
  fs.existsSync(path.join(__dirname, '..', 'public', 'images', 'comitato-festa.png'))
    ? '/images/comitato-festa.png?v=2'
    : null;

app.get('/premio', (req, res) => {
  res.render('prize', {
    title: 'I Premi',
    premiPodio: PREMI_PODIO,
    premiLista: PREMI_LISTA,
    premiGiochi: PREMI_GIOCHI,
    premiTornei: PREMI_TORNEI,
    nomiGiochi: NOMI_GIOCHI,
    totalePremi: PREMI.length,
    ultimaPosizione: ULTIMA_POSIZIONE_PREMIATA,
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
  { file: 'processione-chiesa-gremita.webp', caption: 'La chiesa gremita in attesa: da qui il Santo esce per la processione' },
  { file: 'processione-piazza.webp',    caption: 'Il Santo attraversa la piazza tra la folla, mentre il suo volto illumina le facciate del paese' },
  { file: 'processione-petali.webp',    caption: 'Una pioggia di petali di rosa accoglie San Rocco lungo il percorso' },
  { file: 'processione-fiori.webp',     caption: 'San Rocco tra fiori, luminarie e videomapping: la notte più attesa dell\'anno' },
  { file: 'sanrocco-applausi.jpg',      caption: 'San Rocco ricoperto dagli applausi del suo popolo in uscita dalla processione' },
  { file: 'sanrocco-rientro-fuochi.jpg',caption: 'San Rocco pronto a rientrare in chiesa, acclamato dal suo popolo e onorato con fuochi d\'artificio' },
  { file: 'processione.jpg',            caption: 'San Rocco portato a spalla per le vie di Siano' },
  { file: 'processione-balconi-coriandoli.webp', caption: 'Il Santo passa tra i vicoli mentre dai balconi piovono coriandoli sulla folla' },
  { file: 'processione-finestre-folla.webp', caption: 'Siano si affaccia da finestre e portoni per non perdere il passaggio del Santo' },
];
const GALLERIA_DEVOZIONE = [
  { file: 'sanrocco-popolo.jpg',        caption: 'San Rocco in chiesa: acclamato e immortalato dal suo popolo' },
  { file: 'sanrocco-chiesa-devoti.jpg', caption: 'San Rocco in chiesa dopo la processione, accolto e applaudito dai devoti' },
  { file: 'sanrocco-anziane.jpg',       caption: 'Anziane signore devote interloquiscono all\'interno della chiesa' },
  { file: 'sanrocco-oro.jpg',           caption: 'L\'oro consegnato da generazioni di Sianesi in dono al santo patrono' },
  { file: 'sanrocco-fuochi-anziani.jpg',caption: 'Anziani di Siano osservano i fuochi d\'artificio in onore del Santo' },
  { file: 'sanrocco-maria.jpg',         caption: 'Maria, tra i banchi della chiesa — la devozione che attraversa una vita intera' },
  { file: 'devozione-oro-processione.webp', caption: 'L\'oro votivo issato sul fercolo prima della processione' },
  { file: 'devozione-fercolo-uva.webp', caption: 'Rose, candele e grappoli d\'uva: gli ultimi ritocchi al fercolo del Santo' },
  { file: 'devozione-vestizione-argento.webp', caption: 'La vestizione della statua: l\'argento cesellato prende forma tra le mani dei devoti' },
  { file: 'devozione-mani-fercolo.webp', caption: 'Le mani che preparano il fercolo: nastri, cinghie e la cura di un rito che dura da sempre' },
  { file: 'devozione-altare-statue.webp', caption: 'L\'altare maggiore addobbato a festa, tra le statue dei Santi e i fiori bianchi' },
  { file: 'devozione-turibolo.webp',   caption: 'Il turibolo d\'argento finemente inciso, pronto per la celebrazione' },
  { file: 'devozione-oro-votivo.webp', caption: 'L\'oro donato dai fedeli drappeggiato sulla statua di San Rocco' },
  { file: 'devozione-omelia-anziane.webp', caption: 'Il momento dell\'omelia, seguito con raccoglimento dai fedeli in prima fila' },
  { file: 'devozione-sanrocco-altare.webp', caption: 'San Rocco sull\'altare, tra i fiori, poco prima di uscire in processione' },
  { file: 'devozione-nonno-nipote.webp', caption: 'Un nonno e il suo nipotino davanti al Santo: la devozione che si tramanda' },
  { file: 'devozione-volti-chiesa.webp', caption: 'I volti dei fedeli in chiesa, rapiti dalla funzione in onore del Santo' },
  { file: 'devozione-mani-uva.webp',   caption: 'Mani esperte sistemano l\'uva tra i fiori del fercolo, ultimo dettaglio prima della festa' },
];
const GALLERIA_PALIO = [
  { file: 'palio-fuochi.jpg',       caption: 'I fuochi del Palio esplodono nel cielo di Siano — uno spettacolo rinomato in tutta Italia' },
  { file: 'ventagli.webp',          caption: 'I ventagli caricati e pronti al lancio: ogni lamella porta un fuoco, ogni fuoco porta un applauso' },
  { file: 'fuochisti-preparano.jpg',caption: 'I maestri fuochisti al lavoro: la preparazione delle bombe da tiro è un rito antico' },
  { file: 'mano-bomba.jpg',         caption: 'La mano di un maestro fuochista posata sulla bomba — precisione, esperienza e rispetto' },
  { file: 'fuochista-anziano.jpg',  caption: 'Un anziano maestro prepara le bombe: un sapere trasmesso di generazione in generazione' },
  { file: 'palio-collage.jpg',      caption: 'I fuochisti con la percoca nel vino — tradizione irrinunciabile — e le bombe allineate pronte per il Palio' },
  { file: 'palio-fuochista-1.webp', caption: 'Un fuochista al lavoro tra le bombe, concentrato sui preparativi del Palio' },
  { file: 'palio-fuochista-2.webp', caption: 'Mani esperte maneggiano le bombe da tiro prima dello spettacolo' },
  { file: 'palio-fuochista-3.webp', caption: 'La squadra dei fuochisti al lavoro nelle ore che precedono il Palio' },
  { file: 'palio-fuochista-sigaro.webp', caption: 'Un momento di pausa tra i fuochisti, sigaro in bocca, prima dello spettacolo' },
  { file: 'palio-preparativi-1.webp', caption: 'I preparativi del Palio dei Fuochi, tra tubi di lancio e bombe allineate' },
  { file: 'palio-preparativi-3.webp', caption: 'Le bombe da tiro pronte, in attesa del momento dello spettacolo' },
  { file: 'palio-preparativi-4.webp', caption: 'I maestri fuochisti al lavoro, tra concentrazione e complicità' },
  { file: 'palio-preparativi-5.webp', caption: 'Un altro scorcio dei preparativi del Palio dei Fuochi di Siano' },
  { file: 'palio-tramonto-tubi.webp', caption: 'I tubi di lancio allineati al tramonto, mentre la squadra si concede una pausa' },
  { file: 'palio-preparativi-6.webp', caption: 'Gli ultimi controlli prima dell\'accensione dei fuochi' },
  { file: 'palio-preparativi-7.webp', caption: 'I fuochisti al lavoro, custodi di un\'arte tramandata da generazioni' },
  { file: 'palio-preparativi-8.webp', caption: 'Le mani dei fuochisti al lavoro tra le bombe da tiro' },
  { file: 'palio-preparativi-9.webp', caption: 'Un momento dei preparativi del Palio, poco prima dello spettacolo' },
  { file: 'palio-preparativi-10.webp', caption: 'La squadra dei fuochisti pronta a dare spettacolo per Siano' },
  { file: 'palio-griglia-tubi.webp', caption: 'La griglia di tubi di lancio vista dall\'alto: la geometria perfetta del Palio' },
];
const GALLERIA_LUOGHI = [
  { file: 'campanile.webp', caption: 'Il campanile di San Rocco, simbolo di Siano' },
  { file: 'piazza.webp',    caption: 'La Piazza San Rocco nel cuore di Siano' },
  { file: 'fuochi.webp',    caption: 'I fuochi d\'artificio illuminano il campanile nella notte della festa' },
  { file: 'palio-campanile-notte.webp', caption: 'Il campanile illuminato d\'oro dai fuochi, con la folla che osserva col cuore in gola' },
  { file: 'palio-folla-notte.webp', caption: 'Il campanile avvolto dai fuochi d\'artificio, la folla col telefono in alto a immortalare l\'istante' },
  { file: 'palio-preparativi-2.webp', caption: 'Il campanile stagliato nel cielo mentre esplodono i fuochi del Palio' },
  { file: 'palio-preparativi-11.webp', caption: 'Il campanile avvolto dai fuochi d\'artificio nella notte più attesa dell\'anno' },
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



// I dieci livelli e il calcolo da punti a livello: vedi lib/livelli.js.
const { LEVELS, userLevel } = require('./lib/livelli');
// Le quattro classifiche (generale + due giochi): vedi lib/classifica.js.
const { leaderboardRows, userPoints, gameLeaderboardRows, jetpackLeaderboardRows } = require('./lib/classifica');

// Notifica il salto di livello. Confronta col livello dell'ULTIMA notifica
// (non con uno "prima/dopo" calcolato sul momento): così si può richiamare
// dopo QUALSIASI variazione di punti, in qualunque ordine, senza rischio di
// notificare due volte lo stesso salto né di perderne uno per una race
// condition fra due azioni quasi simultanee.
// level_notified NULL = non l'abbiamo mai controllato (account precedente a
// questa colonna, o primo qualsiasi controllo di un utente nuovo): lo
// allineiamo al livello attuale in silenzio, altrimenti chi è già al
// livello 5 da settimane riceverebbe un annuncio falso al primo controllo.
function checkLevelUp(userId) {
  try {
    const u = db.prepare('SELECT level_notified FROM users WHERE id = ?').get(userId);
    if (!u) return;
    const lvl = userLevel(userPoints(userId));
    if (u.level_notified === null) {
      db.prepare('UPDATE users SET level_notified = ? WHERE id = ?').run(lvl.level, userId);
      return;
    }
    if (lvl.level <= u.level_notified) return;
    db.prepare('UPDATE users SET level_notified = ? WHERE id = ?').run(lvl.level, userId);
    pushToUser(userId, {
      title: '⭐ Livello raggiunto!',
      body: `Sei salito a "${lvl.title}" — livello ${lvl.level} di ${LEVELS.length}!`,
      url: '/profilo',
    }).catch((e) => console.error('[PUSH] livello', e.message));
  } catch (e) { console.error('[LIVELLO]', e.message); }
}

// Avvisa l'utente quando sblocca una o più soglie in un mini-gioco.
// Una sola notifica per partita anche se ne scatta più d'una insieme: una
// bella corsa può sbloccare dieci traguardi in colpo solo e dieci notifiche
// di fila sarebbero spam. Best-effort: se la push fallisce, la partita resta
// comunque valida e i punti sono già stati assegnati.
function notifyGameAwards(userId, gioco, awarded, url) {
  if (!userId || !Array.isArray(awarded) || !awarded.length) return;
  const punti = awarded.reduce((t, a) => t + (a.points || 0), 0);
  const n = awarded.length;
  const title = n === 1 ? '🏆 Traguardo sbloccato!' : `🏆 ${n} traguardi sbloccati!`;
  // Su telefono la notifica viene troncata: oltre i tre, si elencano i primi
  // due e si riassume il resto invece di stampare una lista chilometrica.
  const nomi = n <= 3
    ? awarded.map((a) => a.title).join(' · ')
    : `${awarded[0].title} · ${awarded[1].title} e altri ${n - 2}`;
  pushToUser(userId, {
    title,
    body: `${gioco}: ${nomi} — +${punti} punti in classifica`,
    url: url || '/giochi',
  }).catch((e) => console.error('[PUSH] traguardo', e.message));
}







app.get('/classifica', (req, res) => {
  res.render('leaderboard', {
    title: 'Classifica',
    rows: leaderboardRows(),
    gameRows: gameLeaderboardRows(),
    jetpackRows: jetpackLeaderboardRows(),
    currentUserId: req.currentUser?.id ?? null,
    premioPerPosizione: PREMIO_PER_POSIZIONE,
    premioPerGioco: PREMIO_PER_GIOCO,
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
// Il tetto generale contro gli abusi. Vale sulle rotte che FANNO qualcosa;
// non deve valere sulle immagini, ed è un errore che è costato caro.
//
// Le foto delle prove e gli avatar sono serviti da due rotte normali, quindi
// finivano nel conteggio come una qualsiasi richiesta. Ma una pagina di
// moderazione carica ventiquattro foto in un colpo, e la classifica un
// centinaio di avatar: bastavano una decina di approvazioni di fila per
// arrivare a 300 in un minuto. Il moderatore si vedeva rispondere «too many
// requests» — una pagina bianca con una riga di testo — nel bel mezzo del
// lavoro, e sembrava che il sito fosse rotto.
//
// Le due rotte esentate non sono un buco: /uploads sta dietro requireStaff, e
// /avatar serve file già pubblici. Chi vuole fare danni lo fa sulle rotte che
// scrivono, e quelle restano tutte sotto il tetto.
const STATICHE = /^\/(uploads|avatar)\//;
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false,
  skip: (req) => STATICHE.test(req.path),
});
const gameLimiter = rateLimit({ windowMs: 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });
const slotLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
const wheelLimiter = rateLimit({ windowMs: 60 * 1000, max: 12, standardHeaders: true, legacyHeaders: false });
// Segnalazioni: aperte anche a chi non è loggato (un guasto può impedire di
// entrare, e chi non riesce ad accedere è proprio quello che deve poter
// scrivere), quindi il freno serve. Cinque ogni dieci minuti bastano per
// segnalare un problema e non per allagare il pannello.
const segnalaLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
// Sfide: ogni invito fa partire una MAIL a un indirizzo scritto a mano da un
// utente. Senza freno, un iscritto puo' far spedire centinaia di messaggi a
// estranei dalla nostra casella: bastano pochi "segnala come spam" perche' il
// mittente finisca in blacklist e non arrivi piu' nemmeno il reset password.
// Il conto e' per UTENTE, non per IP: sotto la stessa rete di casa o allo
// stesso stand della festa gli IP si sovrappongono e si frenerebbe l'innocente.
const sfidaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.currentUser ? 'u' + req.currentUser.id : req.ip),
  // La rotta risponde in JSON e il pannello di fine partita legge `errore`:
  // il 429 con l'HTML di default lascerebbe l'utente davanti a un errore muto.
  handler: (req, res) => res.status(429).json({
    ok: false,
    errore: 'Hai lanciato troppe sfide di fila. Riprova fra un quarto d’ora.',
  }),
});
app.use(globalLimiter);

// ── Segnalazioni dal footer ───────────────────────────────────────────────
// Il modulo sta in una finestrella nel footer, quindi la risposta è JSON: la
// pagina non si ricarica e chi stava scrivendo una prova non perde quello che
// aveva in mano.
app.post('/segnalazioni', segnalaLimiter, verifyCsrf, (req, res) => {
  const testo = String(req.body.testo || '').trim().slice(0, 2000);
  if (testo.length < 10) {
    return res.status(400).json({ ok: false, message: 'Scrivi almeno una riga: senza dettagli non riusciamo a capire.' });
  }
  const tipi = ['bug', 'idea', 'altro'];
  const tipo = tipi.includes(req.body.tipo) ? req.body.tipo : 'altro';
  db.prepare(`INSERT INTO segnalazioni (user_id, nickname, tipo, testo, pagina, agente)
              VALUES (?, ?, ?, ?, ?, ?)`).run(
    req.currentUser ? req.currentUser.id : null,
    req.currentUser ? req.currentUser.nickname : null,
    tipo,
    testo,
    String(req.body.pagina || '').slice(0, 200) || null,
    String(req.get('user-agent') || '').slice(0, 300) || null,
  );
  res.json({ ok: true, message: 'Ricevuto, grazie. Ci diamo un’occhiata.' });
});

// --- Registrazione aperta --------------------------------------------------
app.get('/registrati', (req, res) => {
  if (req.currentUser) return res.redirect(dopoAccesso(null));
  // `?invito=CODICE`: e' come arriva chi apre il link di un amico. Il campo
  // si trova gia' compilato — chiedergli di ricopiare a mano un codice che
  // sta nell'indirizzo e' il modo piu' sicuro per perdere il bonus.
  res.render('register', {
    title: 'Registrati',
    invito: inviti.normalizza(req.query.invito),
    puntiInvito: inviti.PUNTI_INVITO,
    sogliaInvito: inviti.SOGLIA_INVITO,
  });
});

app.post('/registrati', registerLimiter, (req, res) => {
  if (req.currentUser) return res.redirect(dopoAccesso(null));

  const nickname = (req.body.nickname || '').trim();
  const email    = (req.body.email || '').trim().toLowerCase() || null;
  const password = req.body.password || '';
  const invito   = inviti.normalizza(req.body.invito);

  // Ogni ritorno al form si porta dietro il codice invito. Il form perde
  // tutto il resto a ogni errore (e' cosi' per ogni campo, non solo qui),
  // ma il codice e' l'unica cosa che l'utente non sa riscrivere a memoria:
  // se sparisce, sparisce il bonus di chi l'ha invitato e non se ne accorge
  // nessuno dei due.
  const tornaAlForm = () => res.redirect('/registrati' + (invito ? '?invito=' + encodeURIComponent(invito) : ''));

  if (nickname.length < 2 || nickname.length > 24) {
    flash(req, 'error', 'Il nickname deve avere tra 2 e 24 caratteri.');
    return tornaAlForm();
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    flash(req, 'error', 'Inserisci un indirizzo email valido.');
    return tornaAlForm();
  }
  if (password.length < 8) {
    flash(req, 'error', 'La password deve avere almeno 8 caratteri.');
    return tornaAlForm();
  }
  if (!req.body.privacy_ok || !req.body.age_ok) {
    flash(req, 'error', 'Devi accettare la privacy policy e confermare l\'età per registrarti.');
    return tornaAlForm();
  }

  // Un codice sbagliato ferma l'iscrizione invece di essere ignorato in
  // silenzio: chi l'ha scritto crede di aver premiato un amico, e scoprirlo
  // dopo non serve piu' a niente — il bonus si paga solo qui.
  const amico = invito ? inviti.invitante(invito) : null;
  if (invito && !amico) {
    flash(req, 'error', 'Codice invito non valido. Controllalo, oppure lascia il campo vuoto per iscriverti senza.');
    return res.redirect('/registrati');
  }

  const existsNick = db.prepare('SELECT id FROM users WHERE nickname = ?').get(nickname);
  if (existsNick) {
    flash(req, 'error', 'Nickname già in uso, scegline un altro.');
    return tornaAlForm();
  }
  const existsEmail = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
  if (existsEmail) {
    flash(req, 'error', 'Email già registrata. Vai su Accedi o recupera la password.');
    return tornaAlForm();
  }
  // Email bloccata quando il suo account e' stato cancellato. Il messaggio
  // non dice "sei stato bloccato": chi ci finisce per sbaglio (un'email
  // riciclata, un omonimo) non c'entra niente, e chi invece ci finisce
  // apposta non ha bisogno di conferme su cosa ha funzionato e cosa no.
  if (bloccoEmail.bloccata(email)) {
    flash(req, 'error', 'Non è possibile iscriversi con questa email. Se pensi sia un errore, scrivici da Segnalazioni.');
    return tornaAlForm();
  }

  // L'hash si calcola PRIMA di aprire la transazione: bcrypt e' lento di
  // proposito e la transazione tiene il lock di scrittura su tutto il
  // database, quindi farlo dentro bloccherebbe l'app per ogni iscrizione.
  const hash = auth.hashPassword(password);

  // Account e bonus nella stessa transazione: o si iscrive e l'amico incassa,
  // o non succede niente. A meta' strada resterebbe un iscritto il cui invito
  // non ha pagato nessuno, e non c'e' un secondo momento in cui rimediare.
  db.transaction(() => {
    const r = db.prepare("INSERT INTO users (nickname, email, password_hash, privacy_accepted_at) VALUES (?, ?, ?, datetime('now'))")
      .run(nickname, email, hash);
    // Solo il collegamento: i punti a chi ha invitato arrivano quando questa
    // persona raggiunge la soglia, non adesso.
    if (amico) inviti.collega(r.lastInsertRowid, amico.id);
  })();

  // L'avviso parte a transazione chiusa e non si aspetta: l'iscrizione e'
  // gia' valida, una push lenta o fallita non deve tenere fermo chi si sta
  // registrando.
  if (amico) inviti.avvisa(amico.id, nickname);

  res.render('register-done', {
    title: 'Registrazione completata',
    nickname,
    invitante: amico ? amico.nickname : null,
    puntiInvito: inviti.PUNTI_INVITO,
    sogliaInvito: inviti.SOGLIA_INVITO,
  });
});

// Dove si atterra dopo il login o l'iscrizione. Normalmente le Missioni,
// che sono il cuore del gioco — ma nella settimana di sole iscrizioni quella
// pagina e' chiusa, e mandarci ogni singolo iscritto vorrebbe dire che la
// prima cosa che vede entrando e' una porta sbarrata. Vale anche per il
// `returnTo`: se uno era stato rimbalzato al login mentre andava su una
// pagina che intanto e' chiusa, riportarcelo non serve a niente.
function dopoAccesso(percorso) {
  const voluto = (typeof percorso === 'string' && /^\/[A-Za-z0-9]/.test(percorso)) ? percorso : '/missioni';
  if (modalita.attiva() && !modalita.consentito(voluto)) return '/';
  return voluto;
}

app.get('/login', (req, res) => res.render('login', { title: 'Accedi' }));

// Hash sentinella: usato se il nickname non esiste, per mantenere tempo costante
const BCRYPT_SENTINEL = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

app.post('/login', loginLimiter, (req, res) => {
  const nickname = (req.body.nickname || '').trim();
  const password = req.body.password || '';
  const remember = req.body.remember === '1' || req.body.remember === 'on';
  // Login con nickname (esatto) OPPURE email (senza distinzione maiuscole/minuscole).
  const user = db.prepare('SELECT * FROM users WHERE nickname = ? OR lower(email) = lower(?) ORDER BY (nickname = ?) DESC LIMIT 1')
    .get(nickname, nickname, nickname);
  // Esegue sempre bcrypt (tempo costante) — previene timing oracle anche se il nickname non esiste
  const passwordOk = auth.verifyPassword(password, user?.password_hash || BCRYPT_SENTINEL);
  if (!user || !passwordOk) {
    flash(req, 'error', 'Nickname o password errati.');
    return res.redirect('/login');
  }
  // Destinazione post-login: solo percorsi interni (no host esterni → niente open-redirect)
  const rt = req.session.returnTo;
  const dest = dopoAccesso(rt);

  // 2FA attiva → non completare il login: chiedi il codice al passaggio successivo
  if (user.totp_enabled) {
    return req.session.regenerate((err) => {
      if (err) { flash(req, 'error', 'Errore interno. Riprova.'); return res.redirect('/login'); }
      req.session.pending2fa = { userId: user.id, remember, dest, ts: Date.now() };
      res.redirect('/login/2fa');
    });
  }

  // Rigenera la sessione per prevenire session-fixation attacks
  req.session.regenerate((err) => {
    if (err) { flash(req, 'error', 'Errore interno. Riprova.'); return res.redirect('/login'); }
    req.session.userId = user.id;
    // «Ricordami»: sessione persistente 30 giorni; altrimenti cookie di sessione
    // (scade alla chiusura del browser). L'ID sessione resta lato server (SQLite),
    // httpOnly + secure + sameSite=lax → nessun token persistente esposto al client.
    if (remember) {
      req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30;
    } else {
      req.session.cookie.expires = false;
    }
    req.session.flash = { type: 'success', msg: `Bentornato/a ${user.nickname}!` };
    res.redirect(dest);
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ── 2FA (TOTP): verifica al login ─────────────────────────────────────────
app.get('/login/2fa', (req, res) => {
  if (!req.session.pending2fa) return res.redirect('/login');
  res.render('login-2fa', { title: 'Verifica in due passaggi' });
});

app.post('/login/2fa', loginLimiter, (req, res) => {
  const p = req.session.pending2fa;
  if (!p) return res.redirect('/login');
  if (Date.now() - (p.ts || 0) > 5 * 60 * 1000) {
    delete req.session.pending2fa;
    flash(req, 'error', 'Sessione scaduta, riaccedi.');
    return res.redirect('/login');
  }
  const user = auth.getUserById(p.userId);
  if (!user || !user.totp_enabled) { delete req.session.pending2fa; return res.redirect('/login'); }

  const code = (req.body.code || '').replace(/\s+/g, '');
  let ok = false;
  if (/^\d{6}$/.test(code)) {
    try { ok = authenticator.verify({ token: code, secret: user.totp_secret }); } catch (e) {}
  }
  // Codice di recupero monouso
  if (!ok && code) {
    let codes = [];
    try { codes = JSON.parse(user.totp_backup_codes || '[]'); } catch (e) { codes = []; }
    const idx = codes.findIndex((h) => auth.verifyPassword(code, h));
    if (idx >= 0) {
      ok = true;
      codes.splice(idx, 1);
      db.prepare('UPDATE users SET totp_backup_codes = ? WHERE id = ?').run(JSON.stringify(codes), user.id);
    }
  }
  if (!ok) { flash(req, 'error', 'Codice non valido.'); return res.redirect('/login/2fa'); }

  const remember = p.remember, dest = p.dest;
  req.session.regenerate((err) => {
    if (err) { flash(req, 'error', 'Errore interno. Riprova.'); return res.redirect('/login'); }
    req.session.userId = user.id;
    if (remember) req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30;
    else req.session.cookie.expires = false;
    req.session.flash = { type: 'success', msg: `Bentornato/a ${user.nickname}!` };
    res.redirect(dopoAccesso(dest));
  });
});

// ── 2FA: gestione (attiva/disattiva) per l'utente loggato ─────────────────
app.get('/2fa', auth.requireLogin, async (req, res) => {
  const u = req.currentUser;
  if (u.totp_enabled) {
    return res.render('twofa', { title: 'Sicurezza · 2FA', enabled: true, qrSvg: null, secret: null, backupCodes: null });
  }
  const secret = authenticator.generateSecret();
  req.session.totpSetup = secret;
  const otpauth = authenticator.keyuri(u.nickname, 'FantaSanRocco', secret);
  let qrSvg = '';
  try { qrSvg = await QRCode.toString(otpauth, { type: 'svg', margin: 1 }); } catch (e) {}
  res.render('twofa', { title: 'Sicurezza · 2FA', enabled: false, qrSvg, secret, backupCodes: null });
});

app.post('/2fa/attiva', auth.requireLogin, (req, res) => {
  const u = req.currentUser;
  if (u.totp_enabled) return res.redirect('/2fa');
  const secret = req.session.totpSetup;
  const code = (req.body.code || '').replace(/\s+/g, '');
  let ok = false;
  try { ok = !!secret && /^\d{6}$/.test(code) && authenticator.verify({ token: code, secret }); } catch (e) {}
  if (!ok) { flash(req, 'error', 'Codice non valido: riprova con quello attuale dell\'app.'); return res.redirect('/2fa'); }
  const plain = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex'));
  const hashes = plain.map((c) => auth.hashPassword(c));
  db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 1, totp_backup_codes = ? WHERE id = ?')
    .run(secret, JSON.stringify(hashes), u.id);
  delete req.session.totpSetup;
  audit(req, '2fa.attiva', u.nickname);
  res.render('twofa', { title: 'Sicurezza · 2FA', enabled: true, qrSvg: null, secret: null, backupCodes: plain });
});

app.post('/2fa/disattiva', auth.requireLogin, (req, res) => {
  const u = req.currentUser;
  if (!auth.verifyPassword(req.body.password || '', u.password_hash)) {
    flash(req, 'error', 'Password errata: 2FA non disattivata.');
    return res.redirect('/2fa');
  }
  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_backup_codes = NULL WHERE id = ?').run(u.id);
  audit(req, '2fa.disattiva', u.nickname);
  flash(req, 'success', 'Verifica in due passaggi disattivata.');
  res.redirect('/2fa');
});

// =========================================================================
//  RECUPERO PASSWORD (utenti non loggati)
// =========================================================================

// Configurazione della posta in uscita: vedi lib/email.js.
const { makeMailTransporter, mittente, rispondiA } = require('./lib/email');

app.get('/programmazione', (req, res) => {
  res.render('programmazione', { title: 'Programmazione', places: placesWithEvents() });
});

app.get('/storia', (req, res) => {
  res.render('storia', { title: 'La Storia di San Rocco' });
});

// I fuochisti in gara stanno in dati/palio.js: cambiano ogni edizione.
const { PALIO_FUOCHISTI } = require('./dati/palio');

app.get('/palio', (req, res) => {
  // Il pronostico vive qui (non più fra le missioni). Ai non loggati mostro
  // comunque la card, con l'invito ad accedere al posto delle opzioni.
  const pst = palioState();
  const pronostico = {
    open: !!pst.open && pst.winner === null,
    resolved: pst.winner !== null,
    winner: pst.winner,
    points: pst.points,
    fuochisti: PALIO_FUOCHISTI.map((f) => f.name),
    myChoice: req.currentUser ? palioMyChoice(req.currentUser.id) : null,
  };
  res.render('palio', { title: 'Palio dei Fuochi', fuochisti: PALIO_FUOCHISTI, pronostico });
});

// ── Pronostico Palio dei Fuochi: helper condivisi ──────────────────────────
function palioState() {
  return db.prepare('SELECT * FROM palio_pronostico WHERE id = 1').get()
    || { id: 1, open: 1, winner: null, points: 500, resolved_at: null };
}
// Conteggio voti per ciascun fuochista (array parallelo a PALIO_FUOCHISTI)
function palioVoteCounts() {
  const counts = PALIO_FUOCHISTI.map(() => 0);
  for (const r of db.prepare('SELECT choice, COUNT(*) AS n FROM palio_predictions GROUP BY choice').all()) {
    if (r.choice >= 0 && r.choice < counts.length) counts[r.choice] = r.n;
  }
  return counts;
}
function palioMyChoice(userId) {
  const r = db.prepare('SELECT choice FROM palio_predictions WHERE user_id = ?').get(userId);
  return r ? r.choice : null;
}
// Nome breve del fuochista per etichette compatte (senza forma societaria)
function palioShortName(name) {
  return name.replace(/\s+(s\.a\.s\.|s\.r\.l\.|Fireworks Events|Fireworks|Events).*$/i, '').trim() || name;
}

// ── Pronostici generici (creabili dal pannello) ────────────────────────────
function predOptions(row) { try { const a = JSON.parse(row.options); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
// Indici scelti da un voto (voto multiplo → più indici). Ricade su [choice] per i voti vecchi.
function voteChoices(row) {
  if (row.choices) { try { const a = JSON.parse(row.choices); if (Array.isArray(a)) return a; } catch (e) {} }
  return (row.choice === null || row.choice === undefined) ? [] : [row.choice];
}
// Conteggio voti per opzione: nel voto multiplo un utente conta su ogni opzione scelta.
function predVoteCounts(predId, nOpts) {
  const counts = new Array(nOpts).fill(0);
  for (const r of db.prepare('SELECT choice, choices FROM prediction_votes WHERE prediction_id = ?').all(predId)) {
    for (const c of voteChoices(r)) if (c >= 0 && c < nOpts) counts[c]++;
  }
  return counts;
}
// «Stasera» o «domani sera»? Lo decide l'orologio, non il testo salvato.
//
// Il pronostico della sera N si apre alle 18 del giorno PRIMA. Fra le 18 e
// mezzanotte «stasera» è semplicemente falso: la serata è quella dopo, e chi
// legge non capisce per quale sera sta scegliendo il colore. A mezzanotte la
// parola cambia da sola.
//
// La serata è il giorno in cui il pronostico CHIUDE (chiude alle 18 della
// sera stessa), non quello in cui si apre.
function seraDelPronostico(closesAt) {
  if (!closesAt) return 'stasera';
  const serata = String(closesAt).slice(0, 10);
  const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
  const giorni = Math.round((Date.parse(serata + 'T00:00:00Z') - Date.parse(oggi + 'T00:00:00Z')) / 86400000);
  if (giorni === 0) return 'stasera';
  if (giorni === 1) return 'domani sera';
  return `la sera del ${Number(serata.slice(8, 10))} agosto`;
}

// La descrizione come va mostrata adesso. Il segnaposto {SERA} è la via
// pulita; la sostituzione di «stasera» scritto a mano serve ai pronostici
// già in produzione, che quella parola ce l'hanno dentro fissa.
function testoPronostico(p) {
  const parola = seraDelPronostico(p.closes_at);
  return String(p.description || '')
    .replace(/\{SERA\}/gi, parola)
    .replace(/\bstasera\b/gi, parola);
}

// Pronostici visibili al giocatore (non archiviati): con le sue scelte.
//
// Quelli GIÀ DICHIARATI spariscono dall'elenco. Il giocatore l'esito lo ha
// saputo dalla notifica nel momento in cui è arrivato, e i punti li vede
// nello storico del profilo: tenerli qui vuol dire solo allungare la pagina
// di serate finite, e a fine festa sarebbero cinque schede morte sopra
// l'unica che si può ancora giocare.
//
// Restano quindi due cose sole: il pronostico aperto e quelli chiusi ma
// ANCORA SENZA esito — che è giusto vedere, perché aspetti la risposta.
// (Nel pannello dello staff continuano a esserci tutti: lì servono.)
function predictionsForUser(userId) {
  const rows = db.prepare('SELECT * FROM predictions WHERE archived = 0 AND winner IS NULL ORDER BY id DESC').all();
  return rows.map((p) => {
    const opts = predOptions(p);
    const mine = db.prepare('SELECT choice, choices FROM prediction_votes WHERE prediction_id = ? AND user_id = ?').get(p.id, userId);
    return {
      id: p.id, title: p.title, description: testoPronostico(p), options: opts, points: p.points, multi: !!p.multi,
      // `open` tiene conto anche dell'orario di chiusura: se no la pagina
      // mostrava ancora il modulo di voto dopo le 18 e il rifiuto arrivava
      // solo premendo «conferma».
      open: !!p.open && p.winner === null
            && !(p.closes_at && romeStringToDate(p.closes_at).getTime() <= Date.now()),
      resolved: p.winner !== null, winner: p.winner,
      myChoices: mine ? voteChoices(mine) : [],
    };
  });
}
// Riassegna i punti di un pronostico (storno idempotente + accredito ai giusti).
// winnerIdx null = solo storno. Chi ha indovinato ma ha scelto PIÙ opzioni prende
// metà punti (arrotondati per difetto). Restituisce gli id dei vincitori.
function predictionAward(pred, winnerIdx) {
  return db.transaction(() => {
    for (const v of db.prepare('SELECT user_id, awarded_points FROM prediction_votes WHERE prediction_id = ? AND awarded_points <> 0').all(pred.id)) {
      punti.muovi(v.user_id, -v.awarded_points, 'storno', `Pronostico «${pred.title}» ridichiarato`);
    }
    db.prepare('UPDATE prediction_votes SET awarded_points = 0 WHERE prediction_id = ? AND awarded_points <> 0').run(pred.id);
    const winners = [];
    if (winnerIdx !== null && winnerIdx !== undefined && pred.points > 0) {
      for (const v of db.prepare('SELECT user_id, choice, choices FROM prediction_votes WHERE prediction_id = ?').all(pred.id)) {
        const chosen = voteChoices(v);
        if (!chosen.includes(winnerIdx)) continue;
        const pts = chosen.length > 1 ? Math.floor(pred.points / 2) : pred.points;   // hedge → metà punti
        if (pts <= 0) continue;
        punti.muovi(v.user_id, pts, 'pronostico', `«${pred.title}»` + (chosen.length > 1 ? ' (più risposte: metà punti)' : ''));
        db.prepare('UPDATE prediction_votes SET awarded_points = ? WHERE prediction_id = ? AND user_id = ?').run(pts, pred.id, v.user_id);
        winners.push(v.user_id);
      }
    }
    return winners;
  })();
}

app.get('/privacy', (req, res) => {
  res.render('privacy', {
    title: 'Privacy Policy',
    updatedAt: new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }),
    contactEmail: process.env.PRIVACY_CONTACT_EMAIL || process.env.EMAIL_USER || 'info@fantasanrocco.com',
  });
});

app.get('/termini', (req, res) => {
  res.render('termini', {
    title: 'Termini di servizio',
    updatedAt: new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }),
  });
});

// ── Sezione unica «Giochi e Slot» ─────────────────────────────────────────
// Una sola pagina con la riga di scelta: runner, jetpack e slot. La slot gira
// sui punti, quindi il suo pannello chiede l'accesso se non si è loggati;
// il resto della sezione resta pubblico.
app.get('/giochi', (req, res) => {
  const achievements = userGameAchievements(req.currentUser ? req.currentUser.id : null);
  // Le sfide in sospeso e quelle lanciate. `require` qui dentro e non in cima
  // perche' il modulo e' definito piu' giu', dopo i mini-giochi.
  const mieSfide = req.currentUser
    ? { ricevute: require('./lib/sfide').inAttesaPer(req.currentUser.id),
        lanciate: require('./lib/sfide').lanciateDa(req.currentUser.id) }
    : { ricevute: [], lanciate: [] };
  res.render('giochi', {
    title: 'Giochi e Slot',
    achievements,
    sfide: mieSfide,
    sfideGiochi: require('./lib/sfide').GIOCHI,
    best: req.currentUser ? (req.currentUser.game_best || 0) : 0,
    plays: req.currentUser ? (req.currentUser.game_plays || 0) : 0,
    // dati della slot (le tabelle sono costanti: informative anche da sloggati)
    symbols: SLOT_SYMBOLS.map((s) => s.key),
    bets: SLOT_BETS,
    betMin: SLOT_BET_MIN,
    betMax: SLOT_BET_MAX,
    triple: SLOT_TRIPLE,
    pair: SLOT_PAIR,
    // Slot 5x4: simboli, tabella e linee servono alla pagina per disegnare
    // la griglia e la tabella dei pagamenti.
    slot5: {
      colonne: slot5.COLONNE, righe: slot5.RIGHE,
      simboli: slot5.SIMBOLI, pagamenti: slot5.PAGAMENTI,
      linee: slot5.LINEE.length, bonusMinimo: slot5.BONUS_MINIMO,
      moltiplicatori: slot5.BONUS_MOLTIPLICATORI,
    },
    balance: req.currentUser ? userPoints(req.currentUser.id) : 0,
    // Missioni di carriera del Jetpack (3 attive) + grado raggiunto
    jpMissions: jpMissionsFor(req.currentUser ? req.currentUser.id : null),
    jpStars: req.currentUser ? (req.currentUser.jp_stars || 0) : 0,
    jpBest: req.currentUser ? (req.currentUser.jp_best || 0) : 0,
    jpRank: jpRankName(req.currentUser ? (req.currentUser.jp_stars || 0) : 0),
    jpPerRank: JP_STARS_PER_RANK,
    jpRanks: jpRankList(req.currentUser ? (req.currentUser.jp_stars || 0) : 0),
  });
});
// Vecchi indirizzi → la sezione unica (link esistenti e segnalibri restano validi)
app.get('/gioco', (req, res) => res.redirect(301, '/giochi?g=runner'));

// Ticket anti-cheat delle partite: vedi giochi/anticheat.js.
const { newGameSession, takeGameSession } = require('./giochi/anticheat');
// Traguardi del runner e loro trasformazione in missioni: giochi/traguardi.js.
const { GAME_ACHIEVEMENTS, ensureGameMissions, gameMissionId, userGameAchievements } = require('./giochi/traguardi');

// Inizio partita → rilascia un ticket col timestamp del server.
app.post('/gioco/inizio', auth.requireLogin, gameLimiter, verifyCsrf, (req, res) => {
  res.json({ ok: true, token: newGameSession(req, 'runner') });
});

// Report del punteggio di fine partita: aggiorna il record e assegna i
// traguardi non ancora conquistati (solo loggati). Idempotente.
app.post('/gioco/punteggio', auth.requireLogin, gameLimiter, verifyCsrf, (req, res) => {
  const MAX_PLAUSIBLE_SCORE = 38000;  // cap assoluto: sta sopra il traguardo piu' alto (36.000)
  const MAX_DELTA_PER_GAME  = 3000;   // fallback senza ticket valido
  const MIN_GAME_SEC        = 3;      // durata minima perché la partita "conti"
  const BASE_ALLOWANCE      = 400;    // margine iniziale (bonus presi subito)
  const MAX_SCORE_PER_SEC   = 420;    // ritmo massimo plausibile: il gioco fa 198 pt/s
                                      // (396 con la reliquia x2), quindi 120 tagliava le partite oneste

  const rawScore = Math.max(0, Math.min(MAX_PLAUSIBLE_SCORE, parseInt(req.body.score, 10) || 0));
  const prevBest = req.currentUser.game_best || 0;

  // Ticket monouso: lega il punteggio al tempo reale trascorso.
  const sess = takeGameSession(req, 'runner', req.body.token);
  const validSession = !!sess;
  let elapsedSec = 0;
  if (validSession) elapsedSec = (Date.now() - sess.startMs) / 1000;

  let score, countsAsPlay;
  if (validSession) {
    const timeCap = BASE_ALLOWANCE + elapsedSec * MAX_SCORE_PER_SEC;
    score = Math.min(rawScore, timeCap);          // impossibile superare il ritmo umano
    countsAsPlay = elapsedSec >= MIN_GAME_SEC;     // niente "partite" lampo
  } else {
    // Nessun ticket valido (cache vecchia o manomissione): crescita prudente,
    // e non conta come partita giocata (niente farming dei traguardi a partite).
    score = Math.min(rawScore, prevBest + MAX_DELTA_PER_GAME);
    countsAsPlay = false;
  }
  score = Math.max(0, Math.min(MAX_PLAUSIBLE_SCORE, Math.floor(score)));

  const plays = (req.currentUser.game_plays || 0) + (countsAsPlay ? 1 : 0);
  const awarded = [];
  db.transaction(() => {
    if (score > prevBest) {
      db.prepare('UPDATE users SET game_best = ? WHERE id = ?').run(score, req.currentUser.id);
    }
    if (countsAsPlay) {
      db.prepare('UPDATE users SET game_plays = ? WHERE id = ?').run(plays, req.currentUser.id);
      // Riga di storico per le statistiche. Solo le partite che CONTANO: così
      // i tempi medi non vengono falsati dalle chiusure lampo e dai tentativi
      // senza ticket, che infatti non toccano nemmeno i traguardi.
      db.prepare(`INSERT INTO game_runs (user_id, game, score, seconds) VALUES (?, 'runner', ?, ?)`)
        .run(req.currentUser.id, score, Math.round(elapsedSec * 10) / 10);
    }
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
  const best = Math.max(score, prevBest);
  notifyGameAwards(req.currentUser.id, 'Corri San Rocco', awarded, '/giochi?g=runner');
  // Una partita chiude al massimo UNA sfida: vedi chiudiConPartita().
  const esitoSfida = chiudiSfidaEAvvisa(req.currentUser, 'runner', score);
  // `tagliato` dice al browser che il punteggio mandato NON e' quello contato.
  // Senza, il giocatore vede un record piu' basso di quello che ha appena
  // fatto e non sa perche': sembra che il gioco rubi i punti.
  res.json({
    ok: true, best, plays, awarded, sfida: esitoSfida,
    tagliato: score < rawScore ? { fatto: rawScore, contato: score, motivo: validSession ? 'ritmo' : 'ticket' } : null,
  });
});

// =========================================================================
//  «SAN ROCCO JETPACK» — missioni di carriera (restano fra le partite)
// =========================================================================
// Ogni utente ha 3 missioni attive. Quando ne completa una guadagna una
// STELLA e quella casella viene rimpiazzata da una missione nuova. Ogni 3
// stelle si sale di GRADO, e ogni grado vale punti in classifica: i punti
// entrano con lo stesso meccanismo dei traguardi del runner (una prova già
// approvata su una missione con game_key), quindi NON fanno partire nessuna
// notifica push — checkLevelUp() qui non viene chiamato di proposito.
const JP_MISSIONS = [
  // "run" = da fare in una sola partita · "sum" = si accumula fra le partite
  { key: 'jp-c40',   kind: 'run', metric: 'coins',      goal: 40,   text: 'Raccogli 40 monete in una partita' },
  { key: 'jp-c80',   kind: 'run', metric: 'coins',      goal: 80,   text: 'Raccogli 80 monete in una partita' },
  { key: 'jp-d400',  kind: 'run', metric: 'dist',       goal: 400,  text: 'Arriva a 400 m in una partita' },
  { key: 'jp-d700',  kind: 'run', metric: 'dist',       goal: 700,  text: 'Arriva a 700 m in una partita' },
  { key: 'jp-d1000', kind: 'run', metric: 'dist',       goal: 1000, text: 'Arriva a 1000 m in una partita' },
  // Aggiunte il 13 agosto: 1.000 m non erano piu' un traguardo, il record
  // era gia' a 16.000. Queste due restano dure ma raggiungibili.
  { key: 'jp-d3000', kind: 'run', metric: 'dist',       goal: 3000, text: 'Arriva a 3.000 m in una partita' },
  { key: 'jp-d8000', kind: 'run', metric: 'dist',       goal: 8000, text: 'Arriva a 8.000 m in una partita' },
  { key: 'jp-t2',    kind: 'run', metric: 'transforms', goal: 2,    text: 'Usa 2 mezzi in una partita' },
  { key: 'jp-t3',    kind: 'run', metric: 'transforms', goal: 3,    text: 'Usa 3 mezzi in una partita' },
  { key: 'jp-k12',   kind: 'run', metric: 'knocked',    goal: 12,   text: 'Travolgi 12 fedeli in una partita' },
  { key: 'jp-k25',   kind: 'run', metric: 'knocked',    goal: 25,   text: 'Travolgi 25 fedeli in una partita' },
  { key: 'jp-h2',    kind: 'run', metric: 'halos',      goal: 2,    text: "Prendi 2 aureole in una partita" },
  { key: 'jp-sc300', kind: 'sum', metric: 'coins',      goal: 300,  text: 'Raccogli 300 monete in totale' },
  { key: 'jp-sc800', kind: 'sum', metric: 'coins',      goal: 800,  text: 'Raccogli 800 monete in totale' },
  { key: 'jp-sd3k',  kind: 'sum', metric: 'dist',       goal: 3000, text: 'Percorri 3.000 m in totale' },
  { key: 'jp-sd8k',  kind: 'sum', metric: 'dist',       goal: 8000, text: 'Percorri 8.000 m in totale' },
  { key: 'jp-st10',  kind: 'sum', metric: 'transforms', goal: 10,   text: 'Usa 10 mezzi in totale' },
  { key: 'jp-sk60',  kind: 'sum', metric: 'knocked',    goal: 60,   text: 'Travolgi 60 fedeli in totale' },
  { key: 'jp-sg15',  kind: 'sum', metric: 'games',      goal: 15,   text: 'Gioca 15 partite' },
  { key: 'jp-sg40',  kind: 'sum', metric: 'games',      goal: 40,   text: 'Gioca 40 partite' },
  // Punti della raccolta (monete, fedeli, raggi sfondati): premiano chi gioca
  // "sporco" andando a prendere le cose, non solo chi corre dritto e lontano.
  { key: 'jp-p300',  kind: 'run', metric: 'points',     goal: 450,   text: 'Fai 450 punti in una partita' },
  { key: 'jp-p700',  kind: 'run', metric: 'points',     goal: 1100,  text: 'Fai 1.100 punti in una partita' },
  { key: 'jp-sp4k',  kind: 'sum', metric: 'points',     goal: 6000,  text: 'Accumula 6.000 punti in totale' },
  { key: 'jp-sp12k', kind: 'sum', metric: 'points',     goal: 18000, text: 'Accumula 18.000 punti in totale' },
];
const JP_BY_KEY = Object.fromEntries(JP_MISSIONS.map((m) => [m.key, m]));

// I gradi del Jetpack stanno con i traguardi del runner in
// giochi/traguardi.js: sono la stessa cosa, missioni con game_key.
const { JP_RANKS } = require('./giochi/traguardi');
// Stelle che servono per il primo grado: la pagina lo mostra come "prossimo passo"
const JP_STARS_PER_RANK = JP_RANKS[0].stars;
// Grado raggiunto con N stelle (0 = Recluta)
function jpGradeOf(stars) {
  let g = 0;
  for (const r of JP_RANKS) { if ((stars || 0) >= r.stars) g = r.grade; else break; }
  return g;
}
// Ora che anche i gradi del Jetpack sono definiti, crea/aggiorna le missioni.
ensureGameMissions();

function jpRankName(stars) {
  const g = jpGradeOf(stars);
  if (g <= 0) return 'Recluta';
  return (JP_RANKS[g - 1].title || '').replace('Jetpack · ', '');
}

// I gradi con le stelle che servono e lo stato raggiunto/da raggiungere, così
// la pagina può mostrarli come i traguardi del runner: senza questo elenco non
// si capisce QUANTI punti valga salire di grado.
function jpRankList(stars) {
  const have = stars || 0;
  return JP_RANKS.map((r) => ({
    grade: r.grade,
    stars: r.stars,
    points: r.points,
    title: (r.title || '').replace('Jetpack · ', ''),
    done: have >= r.stars,
  }));
}

// Le 3 missioni attive dell'utente, creandole se mancano (idempotente).
function jpEnsureMissions(userId) {
  let rows = db.prepare('SELECT slot, key, progress FROM jetpack_missions WHERE user_id = ? ORDER BY slot').all(userId);
  if (rows.length >= 3) return rows.slice(0, 3);
  const taken = new Set(rows.map((r) => r.key));
  const ins = db.prepare('INSERT OR REPLACE INTO jetpack_missions (user_id, slot, key, progress) VALUES (?, ?, ?, 0)');
  for (let s = 0; s < 3; s++) {
    if (rows.some((r) => r.slot === s)) continue;
    const pick = jpPickMission(taken);
    if (!pick) break;
    taken.add(pick.key);
    ins.run(userId, s, pick.key);
  }
  rows = db.prepare('SELECT slot, key, progress FROM jetpack_missions WHERE user_id = ? ORDER BY slot').all(userId);
  return rows.slice(0, 3);
}
// Pesca una missione non già attiva
function jpPickMission(taken) {
  const pool = JP_MISSIONS.filter((m) => !taken.has(m.key));
  if (!pool.length) return JP_MISSIONS[Math.random() * JP_MISSIONS.length | 0];
  return pool[Math.random() * pool.length | 0];
}

// Missioni attive in forma leggibile (per la pagina e per il gioco)
function jpMissionsFor(userId) {
  if (!userId) {
    // Sloggati: mostriamo comunque tre esempi, senza avanzamento
    return JP_MISSIONS.slice(0, 3).map((m) => ({ key: m.key, text: m.text, goal: m.goal, progress: 0, kind: m.kind }));
  }
  return jpEnsureMissions(userId).map((r) => {
    const m = JP_BY_KEY[r.key] || JP_MISSIONS[0];
    return { key: m.key, text: m.text, goal: m.goal, progress: Math.min(r.progress, m.goal), kind: m.kind };
  });
}

// Applica i risultati di una partita: avanza le missioni, assegna stelle,
// gradi e i relativi punti in classifica. Ritorna il riepilogo per il client.
function jpApplyRun(userId, run) {
  const done = [];
  let stars = 0, awarded = [];
  db.transaction(() => {
    const rows = jpEnsureMissions(userId);
    // `avoid` tiene fuori dal sorteggio sia le missioni ancora attive sia
    // quelle appena completate: altrimenti la stessa missione facile
    // ricomparirebbe subito, partita dopo partita.
    const avoid = new Set(rows.map((r) => r.key));
    const upd = db.prepare('UPDATE jetpack_missions SET progress = ? WHERE user_id = ? AND slot = ?');
    const swap = db.prepare('UPDATE jetpack_missions SET key = ?, progress = 0 WHERE user_id = ? AND slot = ?');
    for (const r of rows) {
      const m = JP_BY_KEY[r.key];
      if (!m) continue;
      const v = m.metric === 'games' ? 1 : (run[m.metric] || 0);
      // "run": conta il meglio di una singola partita · "sum": si accumula
      const prog = m.kind === 'sum'
        ? Math.min(m.goal, r.progress + v)
        : Math.min(m.goal, Math.max(r.progress, v));
      if (prog >= m.goal) {
        done.push({ text: m.text });
        const next = jpPickMission(avoid);   // m.key resta in `avoid`: non si ripesca
        avoid.add(next.key);
        swap.run(next.key, userId, r.slot);
      } else if (prog !== r.progress) {
        upd.run(prog, userId, r.slot);
      }
    }
    if (done.length) {
      db.prepare('UPDATE users SET jp_stars = jp_stars + ? WHERE id = ?').run(done.length, userId);
    }
    stars = (db.prepare('SELECT jp_stars FROM users WHERE id = ?').get(userId) || {}).jp_stars || 0;

    // Gradi raggiunti → punti in classifica (prova già approvata, idempotente).
    // Di proposito NON chiamiamo checkLevelUp(): niente notifiche push da qui.
    const grade = jpGradeOf(stars);
    for (const rk of JP_RANKS) {
      if (rk.grade > grade) break;
      const mid = gameMissionId(rk.key);
      if (!mid) continue;
      const has = db.prepare("SELECT 1 FROM submissions WHERE user_id = ? AND mission_id = ? AND status = 'approved'")
        .get(userId, mid);
      if (has) continue;
      db.prepare(`INSERT INTO submissions (user_id, mission_id, status, note, review_note)
                  VALUES (?, ?, 'approved', 'jetpack', 'auto')`).run(userId, mid);
      awarded.push({ title: rk.title, points: rk.points });
    }
  })();
  return { done, stars, grade: jpGradeOf(stars), rank: jpRankName(stars), awarded };
}

// Inizio partita jetpack → ticket col timestamp del server (come il runner)
app.post('/jetpack/inizio', auth.requireLogin, gameLimiter, verifyCsrf, (req, res) => {
  res.json({ ok: true, token: newGameSession(req, 'jetpack') });
});

// Fine partita: il client NON è fidato, ogni valore è limitato dal tempo
// realmente trascorso secondo l'orologio del server.
app.post('/jetpack/fine', auth.requireLogin, gameLimiter, verifyCsrf, (req, res) => {
  // Soglia bassa di proposito: serve solo a scartare i "ticket lampo" chiusi
  // all'istante. Prima era 8 secondi e buttava via partite vere — chi moriva
  // presto dopo aver travolto due fedeli non vedeva contare nulla. A tenere
  // onesti i numeri ci pensano i tetti qui sotto, che crescono col tempo:
  // una corsa di 4 secondi vale al massimo 4 secondi di raccolta.
  const MIN_GAME_SEC = 3;
  // Tetti calcolati sulla fisica reale del gioco, non "a occhio": sono il
  // massimo che una partita onesta può produrre, così non si possono farmare
  // punti di classifica dichiarando risultati gonfiati in partite lampo.
  //  · dist:  velocità max 3.7 ×1.35 (razzo) ×0.35 ×60fps ≈ 105 m/s
  //  · coins: un gruppo da 5-8 monete ogni ~75-140 unità di mondo ≈ 8/s
  //  · transforms: servono 4-5 lettere distanziate ≈ una ogni 5 s al meglio
  //  · knocked: un fedele ogni 130-320 unità di mondo ≈ 3/s
  //  · halos:   un'aureola ogni 1000-1700 unità di mondo ≈ una ogni 6 s
  //  · points: la raccolta rende al massimo ~93 pt/s (55 dalle monete, 30 dai
  //    raggi sfondati con la zampata, 8 dai fedeli col cane): 120 lascia
  //    margine per missili e lettere senza aprire la porta ai punteggi finti
  // Niente bonus fisso per partita: il credito è ESATTAMENTE proporzionale ai
  // secondi giocati. È la regola più onesta e insieme la più solida — con un
  // bonus fisso, spezzare il gioco in tante corse brevi renderebbe più di una
  // lunga; così invece dieci corse da tre secondi valgono quanto una da
  // trenta, e chi muore presto viene comunque pagato per quello che ha fatto.
  // I valori al secondo tengono un margine sul massimo reale del gioco, così
  // un giocatore bravo non viene mai tagliato.
  const CAPS = {
    dist:       { base: 0, perSec: 115 },     // max reale ~105 m/s
    points:     { base: 0, perSec: 115 },     // max reale ~93 pt/s
    coins:      { base: 0, perSec: 10 },      // gruppi da 5-8 monete
    transforms: { base: 0, perSec: 1 / 4 },   // una ogni ~5 s nel caso migliore
    knocked:    { base: 0, perSec: 2 },       // max reale ~1,3 fedeli/s
    halos:      { base: 0, perSec: 1 / 5 },   // una ogni ~6 s
  };
  const sess = takeGameSession(req, 'jetpack', req.body.token);
  const valid = !!sess;
  let elapsed = 0;
  if (valid) elapsed = (Date.now() - sess.startMs) / 1000;

  // Senza ticket valido la partita non conta: niente stelle né punti.
  // `motivo` distingue i due casi, che per chi gioca sono cose diverse:
  // "hai chiuso subito" è colpa sua, "il ticket non c'è più" è colpa nostra
  // (un riavvio del server) e dirgli "partita troppo breve" dopo dieci minuti
  // di gioco è una bugia che fa sembrare il gioco rotto.
  if (!valid || elapsed < MIN_GAME_SEC) {
    return res.json({
      ok: true, counted: false, motivo: valid ? 'breve' : 'ticket',
      done: [], awarded: [], stars: (req.currentUser.jp_stars || 0),
    });
  }
  const run = {};
  for (const k in CAPS) {
    const raw = Math.max(0, parseInt(req.body[k], 10) || 0);
    run[k] = Math.floor(Math.min(raw, CAPS[k].base + elapsed * CAPS[k].perSec));
  }
  const prevBest = req.currentUser.jp_best || 0;
  if (run.dist > prevBest) db.prepare('UPDATE users SET jp_best = ? WHERE id = ?').run(run.dist, req.currentUser.id);
  db.prepare('UPDATE users SET jp_plays = jp_plays + 1 WHERE id = ?').run(req.currentUser.id);
  // Storico per le statistiche: qui `score` sono METRI, non punti — il jetpack
  // si misura in distanza. Vedi la nota su game_runs in db.js.
  db.prepare(`INSERT INTO game_runs (user_id, game, score, seconds) VALUES (?, 'jetpack', ?, ?)`)
    .run(req.currentUser.id, run.dist, Math.round(elapsed * 10) / 10);

  const out = jpApplyRun(req.currentUser.id, run);
  // i gradi si chiamano "Jetpack · Aviatore": nel testo il gioco è già citato,
  // quindi si toglie il prefisso per non ripeterlo due volte
  notifyGameAwards(
    req.currentUser.id, 'San Rocco Jetpack',
    out.awarded.map((a) => ({ ...a, title: String(a.title || '').replace('Jetpack · ', '') })),
    '/giochi?g=jetpack',
  );
  const esitoSfida = chiudiSfidaEAvvisa(req.currentUser, 'jetpack', run.dist);
  res.json({
    ok: true, counted: true,
    best: Math.max(run.dist, prevBest),
    missions: jpMissionsFor(req.currentUser.id),
    sfida: esitoSfida,
    ...out,
  });
});

// =========================================================================
//  SFIDE FRA AMICI  — un duello a due su un mini-gioco
//  Sta fuori dalla classifica: nessun punto, nessuna stella, nessuna
//  missione. Vedi la nota in lib/sfide.js sul perche'.
// =========================================================================
const sfide = require('./lib/sfide');

// Avvisa chi e' stato sfidato: notifica nell'app se e' iscritto e ha dato il
// permesso, email se abbiamo un indirizzo. Le due strade sono indipendenti —
// chi non ha installato l'app riceve solo la mail, e viceversa.
function avvisaSfidato({ sfida, link, sfidante, gioco }) {
  const g = sfide.GIOCHI[gioco];
  const titolo = `${sfidante.nickname} ti ha sfidato!`;
  const corpo = `${g.nome}: ha fatto ${sfida.punteggio_sfidante} ${g.unita}. Hai una partita per batterlo.`;

  if (sfida.sfidato_id) {
    pushToUser(sfida.sfidato_id, { title: '⚔️ ' + titolo, body: corpo, url: `/sfida/${sfida.token}` })
      .catch((e) => console.error('[SFIDA] push', e.message));
  }

  const dest = sfida.sfidato_email;
  if (!dest) return;
  const transporter = makeMailTransporter();
  if (!transporter) { console.log(`[SFIDA] nessuna posta configurata — link: ${link}`); return; }
  // Il testo e' piu' lungo di quanto servirebbe, e non per riempire: una mail
  // fatta di tre righe e un link ha il rapporto link/testo dei messaggi di
  // phishing, e i filtri la trattano come tale. Qui si dice chi scrive, cosa
  // e' FantaSanRocco e PERCHE' questo messaggio e' arrivato: e' anche la cosa
  // corretta da scrivere a qualcuno che non e' iscritto e non ci conosce.
  transporter.sendMail({
    from: mittente(),
    replyTo: rispondiA(),
    to: dest,
    subject: `${sfidante.nickname} ti ha sfidato a ${g.nome} — FantaSanRocco`,
    text: `${titolo}\n\n`
      + `${corpo}\n\n`
      + `Accetta la sfida qui:\n${link}\n\n`
      + `La sfida scade fra ${sfide.GIORNI_VALIDA} giorni.\n\n`
      + `--\n`
      + `FantaSanRocco e' il gioco della festa di San Rocco a Siano: missioni, `
      + `classifiche e mini-giochi durante i giorni della festa.\n`
      + `Hai ricevuto questo messaggio perche' ${sfidante.nickname} ha scritto il tuo `
      + `indirizzo per sfidarti. Se non lo conosci, ignora pure la mail: senza il link `
      + `qui sopra non succede niente e non ti scriveremo di nuovo.\n`
      + `Per qualsiasi cosa puoi rispondere a questa email.`,
    html: `<p><strong>${escapeHtml(sfidante.nickname)}</strong> ti ha sfidato a <strong>${escapeHtml(g.nome)}</strong>, uno dei mini-giochi di FantaSanRocco.</p>
           <p>Ha fatto <strong>${sfida.punteggio_sfidante} ${escapeHtml(g.unita)}</strong>. Tu hai <strong>una partita sola</strong> per batterlo.</p>
           <p><a href="${link}">Accetta la sfida</a><br>
              <span style="color:#777;font-size:13px">oppure copia questo indirizzo nel browser: ${link}</span></p>
           <p>La sfida scade fra ${sfide.GIORNI_VALIDA} giorni.</p>
           <hr>
           <p style="color:#777;font-size:13px">
             FantaSanRocco è il gioco della festa di San Rocco a Siano: missioni, classifiche
             e mini-giochi durante i giorni della festa.<br>
             Hai ricevuto questo messaggio perché ${escapeHtml(sfidante.nickname)} ha scritto il tuo
             indirizzo per sfidarti. Se non lo conosci, ignora pure la mail: senza aprire il link
             non succede niente e non ti scriveremo di nuovo.<br>
             Per qualsiasi cosa puoi rispondere a questa email.
           </p>`,
  }).then(() => console.log(`[SFIDA] invito inviato a ${dest}`))
    .catch((e) => console.error('[SFIDA] ERRORE invio a', dest, e.message));
}

// Chiude un duello in sospeso con la partita appena finita e avvisa chi
// l'aveva lanciata. Torna l'esito per il pannello di fine partita, oppure
// null se non c'era nessuna sfida da chiudere (il caso normale).
function chiudiSfidaEAvvisa(utente, gioco, punteggio) {
  try {
    const esito = sfide.chiudiConPartita(utente.id, gioco, punteggio);
    if (!esito) return null;
    const g = sfide.GIOCHI[gioco];
    pushToUser(esito.sfidante_id, {
      title: esito.vinta ? '⚔️ Ti hanno battuto!' : '🛡️ Hai retto la sfida!',
      body: `${utente.nickname} ha fatto ${punteggio} ${g.unita} su ${g.nome} (tu ${esito.punteggio_sfidante}).`,
      url: '/giochi',
    }).catch((e) => console.error('[SFIDA] push esito', e.message));
    return {
      vinta: esito.vinta,
      avversario: esito.sfidante_nome,
      suo: esito.punteggio_sfidante,
      mio: punteggio,
      unita: g.unita,
    };
  } catch (e) { console.error('[SFIDA] chiusura', e.message); return null; }
}

// Lancia una sfida col punteggio dell'ULTIMA partita registrata. Il punteggio
// non arriva dal browser: verrebbe scritto a mano nella richiesta.
app.post('/sfida/crea', auth.requireLogin, sfidaLimiter, verifyCsrf, (req, res) => {
  const gioco = String(req.body.gioco || '');
  const destinatario = String(req.body.destinatario || '').trim();
  if (!sfide.giocoValido(gioco)) return res.status(400).json({ ok: false, errore: 'Gioco sconosciuto.' });
  if (!destinatario) return res.status(400).json({ ok: false, errore: 'Scrivi il nickname o l’email di chi vuoi sfidare.' });

  const punteggio = sfide.ultimoPunteggio(req.currentUser.id, gioco);
  if (!punteggio) return res.status(400).json({ ok: false, errore: 'Gioca una partita prima di lanciare una sfida.' });

  const u = sfide.trovaDestinatario(destinatario);
  if (u && u.id === req.currentUser.id) return res.status(400).json({ ok: false, errore: 'Non puoi sfidare te stesso.' });
  if (!u && !sfide.pareEmail(destinatario)) {
    return res.status(400).json({ ok: false, errore: 'Nessun iscritto con questo nickname. Prova con la sua email.' });
  }

  const creata = sfide.crea({ sfidanteId: req.currentUser.id, gioco, punteggio, destinatario });
  const link = `${publicBaseUrl(req)}/sfida/${creata.token}`;
  const riga = sfide.perToken(creata.token);
  avvisaSfidato({ sfida: riga, link, sfidante: req.currentUser, gioco });
  audit(req, 'sfida.crea', `${gioco} ${punteggio} → ${destinatario}`);
  res.json({
    ok: true, link,
    avvisato: !!(riga.sfidato_id || riga.sfidato_email),
    nome: u ? u.nickname : destinatario,
  });
});

// La pagina della sfida: chi apre il link vede chi lo sfida e con che punteggio.
app.get('/sfida/:token', (req, res) => {
  const s = sfide.perToken(req.params.token);
  if (!s) return res.status(404).render('error', { title: 'Sfida', message: 'Questa sfida non esiste (o e\' stata cancellata).' });
  // Chi apre il link diventa lo sfidato, se la casella era ancora vuota:
  // serve agli inviti per email a chi non era iscritto al momento del lancio.
  if (req.currentUser && !s.sfidato_id && req.currentUser.id !== s.sfidante_id) {
    sfide.agganciaSfidato(s.id, req.currentUser.id);
  }
  res.render('sfida', {
    title: 'Sfida',
    sfida: sfide.perToken(req.params.token),
    gioco: sfide.GIOCHI[s.gioco],
    scaduta: sfide.scaduta(s),
  });
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
// Data (YYYY-MM-DD) italiana di "daysAgo" giorni fa.
function romeDate(daysAgo) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' })
    .format(new Date(Date.now() - (daysAgo || 0) * 86400000));
}
// Offset di Roma (ms) per un dato istante: wall-clock Roma − UTC (gestisce l'ora legale).
function romeOffsetMs(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date).map((x) => [x.type, x.value]));
  const hh = p.hour === '24' ? '00' : p.hour;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +hh, +p.minute, +p.second) - date.getTime();
}
// Converte una stringa "YYYY-MM-DD HH:MM[:SS]" intesa come ora ITALIANA in un
// istante (Date), così le finestre attive delle missioni sono coerenti col fuso
// di Siano qualunque sia il timezone del server (Docker spesso è UTC).
function romeStringToDate(s) {
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return new Date(String(s).replace(' ', 'T'));
  const guessUTC = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  return new Date(guessUTC - romeOffsetMs(new Date(guessUTC)));
}
// Una data del database, come si legge a Siano.
//
// Nel database tutte le date le scrive datetime('now'), che è UTC — giusto
// così: un istante deve essere lo stesso ovunque, e il fuso si mette solo
// quando lo si mostra a qualcuno. Il punto è che finora non lo si metteva:
// le pagine dello staff stampavano la stringa grezza, cioè due ore indietro
// per tutta l'estate (una d'inverno). Con l'orario dei movimenti sbagliato,
// nel registro punti non tornava piu' niente.
//
// Sta nei locals perché il fuso è una faccenda di come si mostra una data,
// e riguarda ogni vista che ne mostra una.
function oraItaliana(quando, conAnno) {
  if (!quando) return '';
  const m = String(quando).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  // Una data senza ora (o in un formato che non conosciamo) torna com'è:
  // meglio il dato grezzo di un "Invalid Date".
  if (!m) return String(quando);
  const istante = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
  const p = Object.fromEntries(new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(istante).map((x) => [x.type, x.value]));
  const giorno = conAnno ? `${p.day}/${p.month}/${p.year}` : `${p.day}/${p.month}`;
  return `${giorno} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}
app.locals.oraItaliana = oraItaliana;

// "Giorno-festa" delle missioni: va dalle 18:00 (ora italiana) del giorno X alle
// 17:59:59 del giorno X+1. Ritorna l'inizio del giorno-festa CORRENTE come stringa
// UTC 'YYYY-MM-DD HH:MM:SS', confrontabile con submissions.created_at (UTC).
function festivalDayStartSQL(now = new Date()) {
  const off = romeOffsetMs(now);
  const rome = new Date(now.getTime() + off);   // wall-clock Roma nei campi UTC
  let y = rome.getUTCFullYear(), mo = rome.getUTCMonth(), d = rome.getUTCDate();
  if (rome.getUTCHours() < 18) {                // prima delle 18 → giorno-festa iniziato ieri
    const prev = new Date(Date.UTC(y, mo, d) - 86400000);
    y = prev.getUTCFullYear(); mo = prev.getUTCMonth(); d = prev.getUTCDate();
  }
  return new Date(Date.UTC(y, mo, d, 18, 0, 0) - off).toISOString().slice(0, 19).replace('T', ' ');
}

// ── Sezioni tematiche delle missioni fisse ─────────────────────────────────
// Completare TUTTE le missioni di una sezione (almeno una prova approvata per
// ciascuna) dà un bonus una tantum.
// Le quattro sezioni e il bonus di completamento stanno in dati/sezioni.js.
const { SECTIONS, sectionBonus, SECTION_BONUS_MAX } = require('./dati/sezioni');
// Progresso per sezione di un utente: { key: { total, done } }
function sectionProgress(userId) {
  const rows = db.prepare(`
    SELECT m.section AS sec, COUNT(*) AS total,
      SUM(CASE WHEN EXISTS(
        SELECT 1 FROM submissions s WHERE s.mission_id = m.id AND s.user_id = ? AND s.status = 'approved'
      ) THEN 1 ELSE 0 END) AS done
    FROM missions m
    WHERE m.section IS NOT NULL AND m.archived = 0
    GROUP BY m.section`).all(userId);
  const map = {};
  for (const r of rows) map[r.sec] = { total: r.total, done: r.done };
  // Il pronostico del Palio non è una missione (vive su /palio e non passa dalle
  // prove), ma conta come tappa di "Paese & Tradizione": basta aver votato.
  const paese = map.paese || (map.paese = { total: 0, done: 0 });
  paese.total += 1;
  if (palioMyChoice(userId) !== null) paese.done += 1;
  return map;
}
// Accredita il bonus per le sezioni appena completate (idempotente). Ritorna le
// sezioni premiate ora.
function checkAndAwardSections(userId) {
  const prog = sectionProgress(userId);
  const awarded = [];
  for (const s of SECTIONS) {
    const p = prog[s.key];
    if (!p || p.total <= 0 || p.done < p.total) continue;
    if (db.prepare('SELECT 1 FROM section_bonuses WHERE user_id = ? AND section = ?').get(userId, s.key)) continue;
    db.transaction(() => {
      const ins = db.prepare('INSERT OR IGNORE INTO section_bonuses (user_id, section) VALUES (?, ?)').run(userId, s.key);
      // Il bonus e' quello della SUA sezione, non piu' uno uguale per tutte.
      if (ins.changes) punti.muovi(userId, sectionBonus(s.key), 'sezione', s.label);
    })();
    awarded.push(s);
  }
  return awarded;
}

// Accredita i bonus-sezione appena maturati E avvisa l'utente. Unico punto di
// verità per entrambe le cose: prima la notifica esisteva solo nel percorso
// della moderazione, quindi chi completava "Paese & Tradizione" votando il
// pronostico del Palio si vedeva accreditare i punti senza ricevere nulla.
// Ritorna le sezioni premiate, così chi chiama può mostrare anche il banner.
function awardSectionsAndNotify(userId, req) {
  const awarded = [];
  try {
    for (const s of checkAndAwardSections(userId)) {
      awarded.push(s);
      const pt = sectionBonus(s.key);
      if (req) audit(req, 'sezione.bonus', `${s.label} → +${pt}pt a user#${userId}`);
      else auditSystem('sezione.bonus', `${s.label} → +${pt}pt a user#${userId}`);
      pushToUser(userId, {
        title: '🏅 Set di missioni completato!',
        body: `Hai finito "${s.label}": +${pt} punti bonus!`,
        url: '/missioni',
      }).catch((e) => console.error('[PUSH] bonus sezione', e.message));
    }
  } catch (e) { console.error('[SEZIONI] bonus', e.message); }
  return awarded;
}

// ── Streak giornaliero (7 giorni, bonus crescente, poi riparte) ─────────
const STREAK_BONUS = [5, 10, 15, 25, 40, 60, 100];   // giorno 1..7
function streakStatus(user) {
  const today = todayStr();
  const claimedToday = user.streak_last_day === today;
  let day;
  if (claimedToday) {
    day = user.streak_day || 1;                 // già rivendicato oggi
  } else if (user.streak_last_day === romeDate(1)) {
    day = (user.streak_day >= 7) ? 1 : (user.streak_day + 1);  // ieri → continua (dopo il 7 riparte)
  } else {
    day = 1;                                    // saltato un giorno o prima volta
  }
  return {
    claimable: !claimedToday,
    currentDay: user.streak_day || 0,
    day,
    bonus: STREAK_BONUS[day - 1] || 0,
    bonuses: STREAK_BONUS,
  };
}
// Rivendica il premio del giorno (idempotente: una sola volta al giorno).
app.post('/api/streak/claim', auth.requireLogin, verifyCsrf, (req, res) => {
  const today = todayStr();
  if (req.currentUser.streak_last_day === today) {
    return res.json({ ok: true, claimed: false, alreadyToday: true, ...streakStatus(req.currentUser) });
  }
  const st = streakStatus(req.currentUser);
  const day = st.day;
  const bonus = STREAK_BONUS[day - 1] || 0;
  db.prepare('UPDATE users SET streak_day = ?, streak_last_day = ? WHERE id = ?')
    .run(day, today, req.currentUser.id);
  punti.muovi(req.currentUser.id, bonus, 'striscia', `Giorno ${day} di 7`);
  checkLevelUp(req.currentUser.id);
  res.json({ ok: true, claimed: true, day, bonus, currentDay: day, bonuses: STREAK_BONUS, balance: userPoints(req.currentUser.id) });
});

// ── Notifiche push: iscrizione / cancellazione (CSRF via header globale) ──
app.post('/api/push/subscribe', (req, res) => {
  const sub = req.body || {};
  if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return res.status(400).json({ ok: false });
  }
  const userId = req.currentUser ? req.currentUser.id : null;
  db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`)
    .run(userId, String(sub.endpoint), String(sub.keys.p256dh), String(sub.keys.auth));
  const delta = reconcileNotifBonus(userId);
  res.json({ ok: true, bonus: NOTIF_BONUS, awarded: delta > 0, balance: userId ? userPoints(userId) : null });
});

app.post('/api/push/unsubscribe', (req, res) => {
  const endpoint = (req.body && req.body.endpoint) || '';
  let userId = req.currentUser ? req.currentUser.id : null;
  if (endpoint) {
    const row = db.prepare('SELECT user_id FROM push_subscriptions WHERE endpoint = ?').get(String(endpoint));
    if (row && row.user_id) userId = row.user_id;
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(String(endpoint));
  }
  const delta = reconcileNotifBonus(userId);
  res.json({ ok: true, removed: delta < 0, balance: userId ? userPoints(userId) : null });
});

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
    db.prepare('UPDATE users SET last_wheel_day = ? WHERE id = ?').run(today, req.currentUser.id);
    punti.muovi(req.currentUser.id, pick.points, 'ruota', pick.jackpot ? 'JACKPOT!' : `Vinti ${pick.points}`);
    result = { index: idx, points: pick.points, jackpot: !!pick.jackpot };
    return true;
  })();
  if (!ok) return res.status(429).json({ ok: false, error: 'already', message: 'Hai già girato oggi. Torna domani!' });
  checkLevelUp(req.currentUser.id);
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
// Scorciatoie in alto, ma la puntata è libera fra MIN e MAX (interi).
//
// ⚠️ Il ×188 qui sopra è della slot a 3 rulli, che NON si gioca più: queste
// costanti le usa la 5×4 di giochi/slot.js, che paga tutt'altro.
//
// PERCHÉ IL MASSIMO È 50 E NON 500. Il 12 agosto la classifica era decisa
// dalla slot: su 81 giocatori 71 avevano perso (−21.788 punti) e 10 vinto
// (+9.369), e i primi due posti erano fatti per il 70% di vincite alla slot.
// Misurato su 20 milioni di giocate:
//
//   moltiplicatore massimo               ×1551
//   una vincita ≥ ×100                   1 su 11.000
//
// Con puntata 500 il colpo grosso valeva centinaia di migliaia di punti,
// mentre TUTTE e 97 le missioni insieme ne valgono 11.950.
//
// PERCHÉ IL MINIMO RESTA 5. punti() arrotonda per difetto, quindi con
// puntate piccole le vincite minori spariscono. Misurato:
//
//   puntata  1 → ritorno 77,7%  (il 35% delle vincite si azzera)
//   puntata  5 → ritorno 85,8%  (4,3%)
//   puntata 10 → ritorno 87,2%  (0,1%)
//   puntata 50 → ritorno 87,6%  (0%)
//
// Abbassare anche il minimo avrebbe reso la slot dieci punti più tirchia
// senza che nessuno capisse perché. Si è abbassato il tetto, non il pavimento.
//
// Il tetto alla puntata da solo NON basta comunque: ×1551 su 50 fa ancora
// 77.550 punti. Il freno vero è SLOT_TETTO_GIORNO qui sotto.
//
// Se va rimisurato: strumenti/slot_rtp.js.
const SLOT_BETS    = [5, 10, 25, 50];
const SLOT_BET_MIN = 5;
const SLOT_BET_MAX = 50;

// Quanto puo' far GUADAGNARE la slot in una giornata. Le perdite non hanno
// tetto: senza rischio non e' piu' una scommessa, e chi punta deve poterci
// rimettere. Il giorno e' quello del calendario italiano, non il giorno-festa
// che parte alle 18: la regola detta ai giocatori dice "al giorno" e deve
// voler dire quello che sembra.
const SLOT_TETTO_GIORNO = 250;
const GIORNO_SLOT = "date(created_at, '+2 hours')";   // UTC → ora italiana

// Quanto ha gia' guadagnato (o perso) oggi alla slot.
function slotNettoOggi(userId) {
  const r = db.prepare(`
    SELECT COALESCE(SUM(delta), 0) AS n FROM punti_movimenti
    WHERE user_id = ? AND causa = 'slot' AND ${GIORNO_SLOT} = date('now', '+2 hours')
  `).get(userId);
  return r ? r.n : 0;
}

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

// La slot vive dentro la sezione unica «Giochi e Slot»
app.get('/slot', (req, res) => res.redirect(301, '/giochi?g=slot'));

// La slot a 3 rulli e' stata sostituita dalla 5x4 (giochi/slot.js). La sua
// funzione e' stata tolta del tutto: era irraggiungibile, ma muoveva i punti
// scavalcando il registro dei movimenti — una trappola per chi ci ripassa.
// Le costanti SLOT_* qui sopra restano: le usano la rotta nuova e la pagina.

// ── SLOT 5x4 «Tombola di San Rocco» ────────────────────────────────────
// La matematica sta tutta in giochi/slot.js e gira SOLO qui: il browser
// riceve la griglia gia' decisa e la disegna. Il ritorno al giocatore e'
// misurato con strumenti/slot_rtp.js — 87,6%, quindi a lungo si perde.

app.post('/slot/gira', auth.requireLogin, slotLimiter, (req, res) => {
  const bet = Number.parseInt(req.body.bet, 10);
  if (!Number.isInteger(bet) || bet < SLOT_BET_MIN || bet > SLOT_BET_MAX) {
    return res.status(400).json({
      ok: false, error: 'bet',
      message: `Puntata non valida: da ${SLOT_BET_MIN} a ${SLOT_BET_MAX} punti.`,
    });
  }
  let out = null;
  const ok = db.transaction(() => {
    const balance = userPoints(req.currentUser.id);
    if (balance < bet) return false;
    // cryptoRandom: la casualita' e' quella del sistema, mai quella del browser
    const g = slot5.gioca(cryptoRandom);
    const payout = slot5.punti(g.unita, bet);
    const net = payout - bet;
    // Il tetto morde solo quando si e' in guadagno sulla giornata. Si taglia
    // qui, non a fine giornata, perche' il saldo mostrato deve essere gia'
    // quello vero: un numero che sale e poi viene ritoccato dopo sarebbe
    // peggio del tetto stesso.
    let accreditato = net, tagliato = 0;
    if (net > 0) {
      const spazio = Math.max(0, SLOT_TETTO_GIORNO - slotNettoOggi(req.currentUser.id));
      if (net > spazio) { accreditato = spazio; tagliato = net - spazio; }
    }
    punti.muovi(req.currentUser.id, accreditato, 'slot',
      `Puntata ${bet}, vinti ${payout}`
      + (g.bonus ? ' (con la Corsa del Cane)' : '')
      + (tagliato ? ` — tetto giornaliero: ${tagliato} non accreditati` : ''));
    out = {
      griglia: g.griglia,
      vincite: g.vincite,
      cani: g.cani,
      bonus: g.bonus ? {
        // al browser servono solo i passi da disegnare, non la matematica
        passi: g.bonus.passi.map((p) => ({ griglia: p.griglia, cane: p.cane, mult: p.mult, vincite: p.vincite })),
        punti: slot5.punti(g.bonus.totale, bet),
      } : null,
      payout, net, win: payout > 0,
      // Al browser servono per dire la verita' sul perche' il saldo e' salito
      // meno della vincita: senza, il giocatore vede 5.000 e ne riceve 40.
      accreditato, tagliato, tettoGiorno: SLOT_TETTO_GIORNO,
    };
    return true;
  })();
  if (!ok) return res.status(400).json({ ok: false, error: 'funds', message: 'Punti insufficienti per questa puntata.' });
  if (out.accreditato > 0) checkLevelUp(req.currentUser.id);
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

  // Base URL fidata: APP_URL (dominio fisso) oppure l'host del tunnel Cloudflare.
  // Non usiamo MAI un host arbitrario da req.get('host') (host header poisoning →
  // furto del token): publicBaseUrl accetta solo APP_URL o domini *.trycloudflare.com.
  const isProd = process.env.NODE_ENV === 'production';
  const baseUrl = publicBaseUrl(req);
  const baseIsLocal = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
  if (isProd && baseIsLocal) {
    console.error('[RESET] Nessun URL pubblico (APP_URL o tunnel): invio reset annullato (anti host-poisoning).');
    flash(req, 'success', genericMsg); // risposta generica: non rivela nulla
    return res.redirect('/login');
  }
  const resetLink = `${baseUrl}/reset-password/${token}`;

  const transporter = makeMailTransporter();
  if (transporter) {
    transporter.sendMail({
      from: mittente(),
      replyTo: rispondiA(),
      to: user.email,
      subject: 'Reimposta la password del tuo account FantaSanRocco',
      text: `Ciao ${user.nickname},\n\n`
        + `hai chiesto di reimpostare la password del tuo account FantaSanRocco.\n\n`
        + `Apri questo indirizzo per sceglierne una nuova (vale 1 ora):\n${resetLink}\n\n`
        + `Se non sei stato tu, non devi fare niente: la password resta quella di prima `
        + `e il link scade da solo.\n\n`
        + `--\n`
        + `FantaSanRocco, il gioco della festa di San Rocco a Siano.\n`
        + `Questa email parte solo quando qualcuno chiede il reset dalla pagina di accesso.\n`
        + `Puoi rispondere a questo messaggio se ti serve una mano.`,
      html: `<p>Ciao <strong>${escapeHtml(user.nickname)}</strong>,</p>
             <p>hai chiesto di reimpostare la password del tuo account FantaSanRocco.</p>
             <p><a href="${resetLink}">Scegli una nuova password</a> — il link vale <strong>1 ora</strong>.<br>
                <span style="color:#777;font-size:13px">Se il pulsante non funziona, copia questo indirizzo nel browser: ${resetLink}</span></p>
             <p>Se non sei stato tu, non devi fare niente: la password resta quella di prima e il link scade da solo.</p>
             <hr>
             <p style="color:#777;font-size:13px">
               FantaSanRocco, il gioco della festa di San Rocco a Siano.<br>
               Questa email parte solo quando qualcuno chiede il reset dalla pagina di accesso.<br>
               Puoi rispondere a questo messaggio se ti serve una mano.
             </p>`,
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
  // Le missioni si possono rifare una volta per "giorno-festa" (18:00→17:59): per il
  // blocco guardo solo le prove del giorno-festa corrente. Le ripetibili non bloccano mai.
  const dayStart = festivalDayStartSQL();
  const mySubs = db.prepare('SELECT mission_id, status FROM submissions WHERE user_id = ? AND created_at >= ?')
    .all(req.currentUser.id, dayStart);
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

  // Lo staff vede in chiaro anche le sfide non ancora uscite: gli serve per
  // rileggere i testi prima che escano. Per tutti gli altri la sorpresa va
  // tolta dall'HTML, non solo sfocata (vedi sotto).
  const staff = ['moderator', 'admin'].includes(req.currentUser.role);

  const list = missions.map((m) => {
    const statuses = byMission[m.id] || [];
    const state = missionState(m);
    const locked = state === 'locked';
    return {
      ...m,
      // Di una missione ancora bloccata NON mando titolo e descrizione al
      // browser: la sfocatura è solo estetica, e chi apre gli strumenti da
      // sviluppatore leggerebbe la sorpresa. Allo staff invece si mandano,
      // perché il pulsante «sbircia» deve avere qualcosa da scoprire.
      title: (locked && !staff) ? null : m.title,
      description: (locked && !staff) ? null : m.description,
      rarity: missionParts(m.title),
      locked,
      expired: state === 'expired',
      unlockLabel: locked ? missionUnlockLabel(m) : null,
      activeNow: state === 'active',
      hasPending:    statuses.includes('pending'),
      hasApproved:   statuses.includes('approved'),
      canSubmit: m.repeatable
        ? true
        : !(statuses.includes('pending') || statuses.includes('approved')),
      completedBy: completedCount[m.id] || 0,
      // Il marchio di chi mette la missione. Si risolve qui e non nel
      // template: la card deve solo leggere due stringhe già pronte, e il
      // nome serve per l'alt dell'immagine.
      //
      // Si manda ANCHE sulle missioni ancora bloccate. Prima no, per non
      // far capire di che sfida si trattasse — ma le sfide giornaliere
      // restano coperte fino al loro giorno (12→18 agosto), e con quella
      // regola il marchio di chi le paga si sarebbe visto per poche ore,
      // il giorno stesso. Chi mette una missione compra la vetrina della
      // settimana, non dell'ultimo pomeriggio. Il velo continua a coprire
      // titolo e descrizione: si sa CHI, non COSA.
      sponsorSrc: (m.sponsor && NOME_SPONSOR[m.sponsor]) ? `/sponsor/${m.sponsor}` : null,
      sponsorNome: m.sponsor ? NOME_SPONSOR[m.sponsor] || null : null,
      // Giorno della sfida, per raggrupparle in pagina. La chiave è la data
      // nuda perché si ordina da sola come stringa; l'etichetta è per gli
      // occhi. Senza finestra restano fuori dai gruppi per data: sono le
      // sfide che valgono sempre.
      giornoKey: m.active_from ? String(m.active_from).slice(0, 10) : null,
      giornoLabel: m.active_from ? romeDayLabel(m.active_from) : null,
    };
  });
  // Il pronostico del Palio è su /palio: qui resta solo la "tappa" della
  // sezione Paese & Tradizione, che rimanda lì.
  const pst = palioState();
  const palioLink = {
    points: pst.points,
    open: !!pst.open && pst.winner === null,
    resolved: pst.winner !== null,
    voted: palioMyChoice(req.currentUser.id) !== null,
  };
  // Progresso delle sezioni tematiche (bonus una tantum al completamento)
  const prog = sectionProgress(req.currentUser.id);
  const awardedSet = new Set(db.prepare('SELECT section FROM section_bonuses WHERE user_id = ?')
    .all(req.currentUser.id).map((r) => r.section));
  const sections = SECTIONS.map((s) => {
    const p = prog[s.key] || { total: 0, done: 0 };
    return { ...s, total: p.total, done: p.done, completed: p.total > 0 && p.done >= p.total, awarded: awardedSet.has(s.key) };
  }).filter((s) => s.total > 0);

  res.render('missions', { title: 'Missioni', missions: list, palioLink, sections, sectionBonusMax: SECTION_BONUS_MAX, staff, predictions: predictionsForUser(req.currentUser.id) });
});

// Salva/aggiorna il pronostico dell'utente (una scelta tra i 6 fuochisti)
app.post('/missioni/pronostico', auth.requireLogin, verifyCsrf, (req, res) => {
  const st = palioState();
  if (!st.open || st.winner !== null) {
    flash(req, 'error', 'I pronostici sono chiusi.');
    return res.redirect('/palio#pronostico');
  }
  const choice = parseInt(req.body.choice, 10);
  if (!Number.isInteger(choice) || choice < 0 || choice >= PALIO_FUOCHISTI.length) {
    flash(req, 'error', 'Seleziona un fuochista valido.');
    return res.redirect('/palio#pronostico');
  }
  db.prepare(`INSERT INTO palio_predictions (user_id, choice) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET choice = excluded.choice, updated_at = datetime('now')`)
    .run(req.currentUser.id, choice);
  flash(req, 'success', `Pronostico salvato: ${PALIO_FUOCHISTI[choice].name}. In bocca al lupo! 🎆`);
  // Il voto è l'ultima tappa di "Paese & Tradizione" per molti: qui può
  // scattare il bonus di sezione, che altrimenti si controlla solo in moderazione.
  for (const s of awardSectionsAndNotify(req.currentUser.id, req)) {
    flash(req, 'success', `🏅 Sezione "${s.label}" completata: +${sectionBonus(s.key)} punti bonus!`);
  }
  checkLevelUp(req.currentUser.id);
  res.redirect('/palio#pronostico');
});

// Voto su un pronostico generico
app.post('/pronostici/:id/vota', auth.requireLogin, verifyCsrf, (req, res) => {
  const p = db.prepare('SELECT * FROM predictions WHERE id = ? AND archived = 0').get(req.params.id);
  if (!p) { flash(req, 'error', 'Pronostico inesistente.'); return res.redirect('/missioni'); }
  if (!p.open || p.winner !== null) { flash(req, 'error', 'Questo pronostico è chiuso.'); return res.redirect('/missioni'); }
  // La chiusura a orario si fa RISPETTARE qui, non solo mostrare. Prima
  // closes_at serviva solo all'avviso «sta per chiudere» e al testo della
  // pagina: passata l'ora si continuava a votare finché qualcuno non
  // chiudeva a mano dal pannello. Su un pronostico che chiede di indovinare
  // com'è vestito il presentatore, votare dopo le 18 vuol dire votare
  // avendolo già visto.
  if (p.closes_at && romeStringToDate(p.closes_at).getTime() <= Date.now()) {
    flash(req, 'error', 'Questo pronostico è chiuso: si votava fino alle ' + String(p.closes_at).slice(11, 16) + '.');
    return res.redirect('/missioni');
  }
  const opts = predOptions(p);
  // choice può arrivare come singolo valore o come array (checkbox multiple)
  let raw = req.body.choice;
  if (raw === undefined) raw = [];
  else if (!Array.isArray(raw)) raw = [raw];
  let chosen = [...new Set(raw.map((v) => parseInt(v, 10)))].filter((v) => Number.isInteger(v) && v >= 0 && v < opts.length);
  if (!chosen.length) { flash(req, 'error', 'Seleziona almeno un\'opzione.'); return res.redirect('/missioni'); }
  if (!p.multi) chosen = [chosen[0]];   // se non è multi-risposta, tieni solo la prima
  chosen.sort((a, b) => a - b);
  db.prepare(`INSERT INTO prediction_votes (prediction_id, user_id, choice, choices) VALUES (?, ?, ?, ?)
    ON CONFLICT(prediction_id, user_id) DO UPDATE SET choice = excluded.choice, choices = excluded.choices, updated_at = datetime('now')`)
    .run(p.id, req.currentUser.id, chosen[0], JSON.stringify(chosen));
  const names = chosen.map((i) => opts[i]).join(', ');
  const halved = p.multi && chosen.length > 1;
  flash(req, 'success', `Pronostico salvato: ${names}.${halved ? ' (più risposte → punti dimezzati se indovini)' : ''} In bocca al lupo!`);
  res.redirect('/missioni');
});

app.get('/missioni/:id', auth.requireLogin, (req, res) => {
  const m = db.prepare('SELECT * FROM missions WHERE id = ? AND archived = 0').get(req.params.id);
  if (!m) return res.status(404).render('error', { title: 'Non trovata', message: 'Missione inesistente.' });
  // Missione non ancora sbloccata: niente dettaglio, altrimenti basterebbe
  // indovinare l'URL per leggere in anticipo le sfide dei giorni successivi.
  if (missionState(m) === 'locked') {
    const when = missionUnlockLabel(m);
    flash(req, 'info', `Questa missione si sblocca${when ? ' il ' + when : ' più avanti'}. Per ora vedi solo la rarità!`);
    return res.redirect('/missioni');
  }
  const statuses = db.prepare('SELECT status FROM submissions WHERE user_id = ? AND mission_id = ? AND created_at >= ?')
    .all(req.currentUser.id, m.id, festivalDayStartSQL()).map((r) => r.status);
  const canSubmit = m.repeatable
    ? true
    : !(statuses.includes('pending') || statuses.includes('approved'));
  res.render('mission', {
    title: m.title.replace(/[^\p{L}\p{N} ]/gu, '').trim() || 'Missione',
    m, statuses, canSubmit, activeNow: isMissionActiveNow(m),
  });
});

app.post('/missioni/:id/invia', auth.requireLogin, (req, res, next) => {
  const m = db.prepare('SELECT * FROM missions WHERE id = ? AND archived = 0').get(req.params.id);
  if (!m) return res.status(404).render('error', { title: 'Non trovata', message: 'Missione inesistente.' });

  // Gestione upload (può fallire per dimensione/tipo). La callback è async
  // perché il calcolo dell'impronta legge e decodifica il file: senza il
  // catch finale un errore qui diventerebbe una promise rifiutata a vuoto,
  // invisibile a Express.
  upload.single('foto')(req, res, async (err) => {
   try {
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
    // L'ordine di queste tre righe non è casuale.
    // 1. La data di scatto si legge PRIMA: ricodificare la foto cancella
    //    tutto l'EXIF, e finirebbe nel nulla.
    // 2. Poi si rimpicciolisce: dal telefono arrivano 4000px e 2 MB, e con
    //    mille iscritti il disco finirebbe a metà festa.
    // 3. L'impronta si calcola DOPO, sul file definitivo — è un confronto
    //    fra impronte, quindi conta che siano tutte fatte allo stesso modo.
    let scatto = null;
    if (req.file) {
      const ex = datiScatto(path.join(UPLOADS_DIR, req.file.filename));
      scatto = ex.scatto ? ex.scatto.toISOString().slice(0, 19).replace('T', ' ') : null;
      const rid = await ridimensiona(UPLOADS_DIR, req.file.filename);
      if (rid) req.file.filename = rid.nomeFile;   // il nome cambia se era .png
    }
    // Impronta della foto per il controllo duplicati in moderazione. Se il
    // calcolo fallisce resta NULL e la prova prosegue: non è un motivo per
    // rifiutare l'invio di qualcuno.
    const phash = req.file ? await photoHash(path.join(UPLOADS_DIR, req.file.filename)) : null;

    // SELECT + INSERT atomico in transazione: previene doppio invio per race condition
    let inserted;
    try {
      inserted = db.transaction(() => {
        // Blocco solo entro il giorno-festa corrente (18:00→17:59). Le ripetibili mai.
        const statuses = db.prepare('SELECT status FROM submissions WHERE user_id = ? AND mission_id = ? AND created_at >= ?')
          .all(req.currentUser.id, m.id, festivalDayStartSQL()).map((r) => r.status);
        const blocked = m.repeatable
          ? false
          : (statuses.includes('pending') || statuses.includes('approved'));
        if (blocked) return false;
        db.prepare('INSERT INTO submissions (user_id, mission_id, photo_path, note, phash, shot_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(req.currentUser.id, m.id, req.file ? req.file.filename : null, (req.body.note || '').trim(), phash, scatto);
        return true;
      })();
    } catch (e) {
      if (req.file) fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
      throw e;
    }
    if (!inserted) {
      if (req.file) fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
      flash(req, 'error', 'Hai già fatto questa missione oggi. Le missioni si rinnovano ogni giorno alle 18:00.');
      return res.redirect(`/missioni/${m.id}`);
    }
    // Avvisa lo staff che ha attivato la categoria "nuove prove" (separata dalle
    // notifiche normali). Non blocca la risposta all'utente.
    try {
      const staff = db.prepare(
        "SELECT id FROM users WHERE role IN ('admin','moderator') AND notif_submissions = 1 AND id <> ?"
      ).all(req.currentUser.id);
      for (const s of staff) {
        pushToUser(s.id, {
          title: '📸 Nuova prova da validare',
          body: `${req.currentUser.nickname} ha inviato «${m.title}»`,
          url: '/moderazione',
          tag: 'nuova-prova',
        }).catch((e) => console.error('[PUSH] nuova prova', e.message));
      }
    } catch (e) { console.error('[PUSH] nuova prova (query)', e.message); }

    flash(req, 'success', 'Prova inviata! Ora aspetta la validazione dello staff. 📨');
    res.redirect('/missioni');
   } catch (e) {
     if (req.file) fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
     next(e);
   }
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
  // «missioni totali» si conta, non si scrive a mano: era rimasto 105 mentre
  // in home lo stesso numero era già dinamico, e le due pagine si
  // contraddicevano. Stesso conteggio della home, vedi la nota lì.
  const nMissioni = db.prepare('SELECT COUNT(*) c FROM missions').get().c;
  res.render('profile', {
    title: 'Il mio profilo',
    subs, total, nMissioni,
    level: userLevel(total),
    badges: userGameAchievements(req.currentUser.id),
    streak: streakStatus(req.currentUser),
    // Il codice nasce qui, la prima volta che qualcuno apre il profilo: gli
    // account creati prima degli inviti non hanno bisogno di migrazioni.
    invito: {
      codice: inviti.codicePer(req.currentUser.id),
      punti: inviti.PUNTI_INVITO,
      soglia: inviti.SOGLIA_INVITO,
      // publicBaseUrl e non l'header Host cosi' com'e': il link va copiato e
      // mandato in giro, e un host falsificato manderebbe gli amici altrove.
      base: publicBaseUrl(req),
      ...inviti.riepilogo(req.currentUser.id),
    },
  });
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
  avatarUpload.single('avatar')(req, res, async (err) => {
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
    let safeName = req.file.filename.replace(/\.[^.]+$/, correctExt);
    try { fs.renameSync(path.join(AVATARS_DIR, req.file.filename), path.join(AVATARS_DIR, safeName)); } catch {}

    // L'avatar si vede in un cerchio da 44-56px ma arriva dal telefono a
    // 4000px: 512 bastano e avanzano. Va PRIMA dell'UPDATE perche'
    // ricodificare cambia l'estensione, e salvare il nome vecchio lascerebbe
    // la riga a puntare a un file che non c'e' piu'.
    const rid = await ridimensiona(AVATARS_DIR, safeName, FOTO_AVATAR);
    if (rid) safeName = rid.nomeFile;

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

// Rimuove un utente e TUTTO ciò che gli appartiene: righe del database e file
// su disco (foto-prova, storie, avatar). Usata sia dall'utente che si cancella
// da solo, sia dall'admin che cancella un account. È irreversibile.
function purgeUser(u) {
  // I percorsi dei file vanno letti PRIMA del DELETE, poi le righe non ci sono più
  const photoFiles = db.prepare('SELECT photo_path FROM submissions WHERE user_id = ? AND photo_path IS NOT NULL').all(u.id).map((r) => r.photo_path);
  const storyFiles = db.prepare('SELECT media_path FROM stories WHERE user_id = ?').all(u.id).map((r) => r.media_path);
  const avatarFile = u.avatar_path;

  let puntiStornati = 0;
  db.transaction(() => {
    // Se questo account era arrivato con un invito, chi l'ha portato perde i
    // punti che ne aveva ricavato. È il motivo per cui cancellare i finti
    // account serve a qualcosa: senza questo, chi se li fabbrica li perde e
    // si tiene i punti, e ripulire non toglierebbe niente a nessuno.
    // Va fatto PRIMA del DELETE: dopo, il riferimento è già stato azzerato.
    puntiStornati = inviti.storna(u.id, u.nickname);

    // Sgancia i riferimenti con vincolo NO ACTION (altrimenti il DELETE fallisce)
    if (invitiCiSono()) {
      db.prepare('UPDATE invites SET used = 0, used_by_user_id = NULL, used_at = NULL WHERE used_by_user_id = ?').run(u.id);
      db.prepare('UPDATE invites SET created_by = NULL WHERE created_by = ?').run(u.id);
    }
    db.prepare('UPDATE submissions SET reviewed_by = NULL WHERE reviewed_by = ?').run(u.id);
    // Elimina l'utente: submissions, stories, story_views, push_subscriptions,
    // section_bonuses, prediction_votes e palio_predictions vanno a cascata;
    // reward_codes.claimed_by torna NULL (codice di nuovo riscattabile).
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  })();

  const rm = (dir, names) => names.forEach((n) => { if (n) fs.unlink(path.join(dir, path.basename(n)), () => {}); });
  rm(UPLOADS_DIR, photoFiles);
  rm(STORIES_DIR, storyFiles);
  if (avatarFile) fs.unlink(path.join(AVATARS_DIR, path.basename(avatarFile)), () => {});

  return { foto: photoFiles.length, storie: storyFiles.length, puntiStornati };
}

// Cancellazione account (diritto all'oblio GDPR): l'utente elimina sé stesso.
// Richiede la password (re-autenticazione) per evitare cancellazioni accidentali/CSRF.
app.post('/profilo/elimina', auth.requireLogin, verifyCsrf, (req, res) => {
  const u = req.currentUser;
  if (!auth.verifyPassword(req.body.password || '', u.password_hash)) {
    flash(req, 'error', 'Password errata: account non eliminato.');
    return res.redirect('/profilo');
  }
  purgeUser(u);
  delete req.session.userId;   // logout (l'utente non esiste più)
  flash(req, 'success', 'Il tuo account e i tuoi dati sono stati eliminati. Ci dispiace vederti andare!');
  res.redirect('/');
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
//  STORIE (foto effimere 24h) — aperte a tutti, pubblicazione immediata
// =========================================================================

// Redirect "indietro" sicuro (stesso host), fallback in home.
function safeBack(req) {
  const ref = req.get('Referer') || '';
  try {
    const u = new URL(ref);
    if (u.host === req.get('host')) return u.pathname + u.search;
  } catch {}
  return '/';
}

// Archi SVG dell'anello segmentato (stesso disegno del componente originale).
function ringSegments(n, viewedFlags) {
  const gap = n > 1 ? 12 : 0;
  const seg = (360 - gap * n) / n;
  const R = 46, C = 50;
  const allViewed = viewedFlags.every(Boolean);
  const out = [];
  for (let i = 0; i < n; i++) {
    const start = -90 + i * (seg + gap);
    const end = start + seg;
    const sr = start * Math.PI / 180, er = end * Math.PI / 180;
    const x1 = (C + R * Math.cos(sr)).toFixed(2), y1 = (C + R * Math.sin(sr)).toFixed(2);
    const x2 = (C + R * Math.cos(er)).toFixed(2), y2 = (C + R * Math.sin(er)).toFixed(2);
    const large = seg > 180 ? 1 : 0;
    out.push({ d: `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`, viewed: viewedFlags[i] || allViewed });
  }
  return out;
}

// Raggruppa le storie attive per utente, con flag "viste" per l'utente corrente.
function activeStoriesGrouped(currentUser) {
  const rows = db.prepare(`
    SELECT s.id, s.user_id, s.media_path, s.created_at, u.nickname, u.avatar_path,
           (SELECT 1 FROM story_views v WHERE v.story_id = s.id AND v.user_id = ?) AS viewed
    FROM stories s JOIN users u ON u.id = s.user_id
    WHERE s.expires_at > datetime('now') AND (s.hidden = 0 OR s.user_id = ?)
    ORDER BY s.created_at ASC
  `).all(currentUser.id, currentUser.id);

  const byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.user_id)) {
      byUser.set(r.user_id, {
        id: r.user_id,
        name: r.user_id === currentUser.id ? 'Tu' : r.nickname,
        avatar: r.avatar_path ? '/avatar/' + path.basename(r.avatar_path) : null,
        initials: app.locals.initials(r.nickname),
        stories: [],
      });
    }
    const ts = Date.parse((r.created_at || '').replace(' ', 'T') + 'Z') || Date.now();
    byUser.get(r.user_id).stories.push({
      id: r.id,
      src: '/storie/media/' + path.basename(r.media_path),
      ts,
      viewed: !!r.viewed,
    });
  }

  const users = [...byUser.values()].map((u) => {
    const viewedFlags = u.stories.map((s) => s.viewed);
    u.segments = ringSegments(u.stories.length, viewedFlags);
    u.allViewed = viewedFlags.every(Boolean);
    u.thumb = u.stories[u.stories.length - 1].src; // ultima foto = copertina del cerchio
    u.lastTs = u.stories[u.stories.length - 1].ts;
    return u;
  });

  // Ordine: "Tu" in testa, poi chi ha storie non viste, poi più recenti.
  users.sort((a, b) => {
    if (a.id === currentUser.id) return -1;
    if (b.id === currentUser.id) return 1;
    if (a.allViewed !== b.allViewed) return a.allViewed ? 1 : -1;
    return b.lastTs - a.lastTs;
  });

  const staff = ['moderator', 'admin'].includes(currentUser.role);
  return { me: { id: currentUser.id, staff }, users };
}

// Pubblica una storia (foto). Multipart → CSRF verificato a mano (come l'avatar).
app.post('/storie', auth.requireLogin, (req, res) => {
  storyUpload.single('foto')(req, res, async (err) => {
    const back = safeBack(req);
    if (err) { flash(req, 'error', err.message || 'Errore nel caricamento.'); return res.redirect(back); }
    const csrfToken = req.body._csrf || '';
    if (!csrfToken || csrfToken !== req.session.csrfToken) {
      if (req.file) fs.unlink(path.join(STORIES_DIR, req.file.filename), () => {});
      return res.status(403).render('error', { title: 'Errore di sicurezza', message: 'Token non valido. Ricarica la pagina.' });
    }
    if (!req.file) { flash(req, 'error', 'Seleziona una foto da pubblicare.'); return res.redirect(back); }
    const mime = checkImageMagicBytes(path.join(STORIES_DIR, req.file.filename));
    if (!mime || !ALLOWED_MIME.has(mime)) {
      fs.unlink(path.join(STORIES_DIR, req.file.filename), () => {});
      flash(req, 'error', 'Formato non ammesso. Carica un\'immagine (JPEG, PNG, WebP, GIF, AVIF).');
      return res.redirect(back);
    }
    const correctExt = MIME_TO_EXT[mime] || '.jpg';
    let safeName = req.file.filename.replace(/\.[^.]+$/, correctExt);
    try { fs.renameSync(path.join(STORIES_DIR, req.file.filename), path.join(STORIES_DIR, safeName)); } catch {}

    // Rimpicciolimento, PRIMA di scrivere il nome nel database: ricodificare
    // cambia l'estensione in .jpg, e registrare il nome vecchio lascerebbe la
    // riga a puntare a un file che non c'è più. Dal telefono arrivano 3-4000px
    // e 2 MB, e durante la festa si carica e si guarda tutto da rete mobile:
    // ogni persona che apre una storia se la scarica intera.
    // Se il ridimensionamento non riesce torna null e resta l'originale: una
    // storia grande è meglio di una storia persa.
    const rid = await ridimensiona(STORIES_DIR, safeName, FOTO_STORIA);
    if (rid) safeName = rid.nomeFile;

    db.prepare("INSERT INTO stories (user_id, media_path, expires_at) VALUES (?, ?, datetime('now','+1 day'))")
      .run(req.currentUser.id, safeName);
    flash(req, 'success', 'Storia pubblicata! Resta visibile 24 ore.');
    res.redirect(back);
  });
});

// Media delle storie: solo per utenti loggati.
app.get('/storie/media/:file', auth.requireLogin, (req, res) => {
  const safe = path.basename(req.params.file);
  const full = path.join(STORIES_DIR, safe);
  if (!fs.existsSync(full)) return res.status(404).send('File non trovato');
  res.sendFile(full);
});

// Segna una storia come vista (CSRF via header globale verifyCsrf).
app.post('/api/storie/:id/visto', auth.requireLogin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ ok: false });
  db.prepare('INSERT OR IGNORE INTO story_views (story_id, user_id) VALUES (?, ?)').run(id, req.currentUser.id);
  res.json({ ok: true });
});

// Elimina una storia: autore o staff.
app.post('/storie/:id/elimina', auth.requireLogin, (req, res) => {
  const id = Number(req.params.id);
  const st = db.prepare('SELECT * FROM stories WHERE id = ?').get(id);
  const staff = ['moderator', 'admin'].includes(req.currentUser.role);
  if (st && (st.user_id === req.currentUser.id || staff)) {
    fs.unlink(path.join(STORIES_DIR, path.basename(st.media_path)), () => {});
    db.prepare('DELETE FROM stories WHERE id = ?').run(id); // story_views via ON DELETE CASCADE
    if (staff && st.user_id !== req.currentUser.id) {
      audit(req, 'storia.elimina', `#${id} (staff)`);
      pushToUser(st.user_id, {
        title: 'Storia rimossa',
        body: 'Un moderatore ha rimosso una tua storia.',
        url: '/profilo',
      }).catch((e) => console.error('[PUSH] storia rimossa', e.message));
    }
  }
  if (req.xhr || (req.headers.accept || '').includes('application/json')) return res.json({ ok: true });
  res.redirect(safeBack(req));
});

const STORY_REPORT_HIDE_AT = 2;   // dopo N segnalazioni distinte la storia si nasconde in attesa di revisione
app.post('/storie/:id/segnala', auth.requireLogin, verifyCsrf, (req, res) => {
  const id = Number(req.params.id);
  const st = db.prepare('SELECT id, user_id, hidden FROM stories WHERE id = ?').get(id);
  if (st) {
    try {
      db.prepare('INSERT INTO story_reports (story_id, reporter_id, reason) VALUES (?, ?, ?)')
        .run(id, req.currentUser.id, (req.body.reason || '').trim().slice(0, 200) || null);
    } catch (e) { /* già segnalata da questo utente: UNIQUE, ignora */ }
    const n = db.prepare('SELECT COUNT(*) AS n FROM story_reports WHERE story_id = ?').get(id).n;
    // Solo al MOMENTO in cui scatta (non era già nascosta): altrimenti ogni
    // segnalazione successiva rimanderebbe lo stesso avviso all'autore.
    if (n >= STORY_REPORT_HIDE_AT && !st.hidden) {
      db.prepare('UPDATE stories SET hidden = 1 WHERE id = ?').run(id);
      pushToUser(st.user_id, {
        title: 'Storia in revisione',
        body: 'Una tua storia è stata segnalata più volte ed è temporaneamente nascosta, in attesa che lo staff la controlli.',
        url: '/profilo',
      }).catch((e) => console.error('[PUSH] storia nascosta', e.message));
    }
  }
  if (req.xhr || (req.headers.accept || '').includes('application/json')) return res.json({ ok: true });
  res.redirect(safeBack(req));
});

// Pulizia periodica delle storie scadute (file + righe).
function purgeExpiredStories() {
  try {
    const expired = db.prepare("SELECT media_path FROM stories WHERE expires_at <= datetime('now')").all();
    for (const s of expired) fs.unlink(path.join(STORIES_DIR, path.basename(s.media_path)), () => {});
    if (expired.length) db.prepare("DELETE FROM stories WHERE expires_at <= datetime('now')").run();
  } catch { /* la pulizia non deve mai bloccare l'app */ }
}
purgeExpiredStories();
setInterval(purgeExpiredStories, 30 * 60 * 1000).unref?.();

// =========================================================================
//  MODERAZIONE (moderatori + admin)
// =========================================================================
// Quante prove per pagina. Non è una scelta estetica: sotto si confronta ogni
// prova mostrata con ogni prova mai caricata, quindi il numero qui decide
// quanto a lungo il server resta fermo a ogni apertura della pagina. Con
// tutte insieme, a festa avviata, erano secondi di sito bloccato PER TUTTI —
// Node ha un thread solo, e mentre gira quel ciclo non risponde a nessuno.
const MOD_PER_PAGINA = 24;

app.get('/moderazione', auth.requireStaff, (req, res) => {
  const totale = db.prepare("SELECT COUNT(*) c FROM submissions WHERE status = 'pending'").get().c;
  const pagine = Math.max(1, Math.ceil(totale / MOD_PER_PAGINA));
  const pagina = Math.min(pagine, Math.max(1, parseInt(req.query.p, 10) || 1));

  const pending = db.prepare(`
    SELECT s.*, u.nickname, m.title, m.points, m.requires_photo,
           m.description AS mission_desc
    FROM submissions s
    JOIN users u ON u.id = s.user_id
    JOIN missions m ON m.id = s.mission_id
    WHERE s.status = 'pending'
    ORDER BY u.nickname ASC, s.created_at ASC
    LIMIT ? OFFSET ?
  `).all(MOD_PER_PAGINA, (pagina - 1) * MOD_PER_PAGINA);

  // Controllo duplicati: per ogni prova in attesa cerchiamo un'altra prova con
  // impronta quasi identica. Il confronto è su TUTTE le prove, di chiunque e
  // di qualsiasi missione: l'imbroglio tipico è la stessa foto rimandata da un
  // altro account o riciclata per una missione diversa.
  const conImpronta = db.prepare(`
    SELECT s.id, s.phash, s.photo_path, s.status, s.created_at, s.mission_id,
           u.nickname, m.title AS mission_title
    FROM submissions s
    JOIN users u ON u.id = s.user_id
    JOIN missions m ON m.id = s.mission_id
    WHERE s.phash IS NOT NULL AND s.photo_path IS NOT NULL
  `).all();

  const STATO = { approved: 'approvata', rejected: 'rifiutata', pending: 'in attesa' };
  for (const p of pending) {
    p.duplicati = [];
    if (!p.phash) continue;
    for (const altra of conImpronta) {
      if (altra.id === p.id) continue;
      const d = phashDistanza(p.phash, altra.phash);
      if (d > PHASH_SOGLIA) continue;
      p.duplicati.push({
        id: altra.id,
        photo_path: altra.photo_path,
        nickname: altra.nickname,
        missione: altra.mission_title,
        quando: altra.created_at,
        stato: STATO[altra.status] || altra.status,
        stessoUtente: altra.nickname === p.nickname,
        identica: d === 0,
        distanza: d,
      });
    }
    // Prima le più simili, poi le più recenti
    p.duplicati.sort((a, b) => a.distanza - b.distanza || b.id - a.id);
  }

  res.render('moderation', { title: 'Moderazione', pending, totale, pagina, pagine });
});

// Approva / Rifiuta. L'UPDATE con "WHERE status='pending'" è la garanzia
// anti doppia-approvazione: se un altro moderatore l'ha già gestita, changes = 0.
app.post('/moderazione/:id/:azione', auth.requireStaff, (req, res) => {
  const azione = req.params.azione === 'approva' ? 'approved' : 'rejected';
  const reviewNote = (req.body.review_note || '').trim();
  // Punti bonus decisi da chi modera, su qualunque missione. Il tetto non è
  // burocrazia: il campo arriva da una richiesta, e senza limite un errore di
  // battitura (o una richiesta costruita a mano) sposterebbe la classifica.
  const bonusGrezzo = parseInt(req.body.bonus, 10);
  const bonus = Number.isInteger(bonusGrezzo) ? Math.max(-500, Math.min(500, bonusGrezzo)) : 0;
  const info = db.prepare(`
    UPDATE submissions
    SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_note = ?
    WHERE id = ? AND status = 'pending'
  `).run(azione, req.currentUser.id, reviewNote, req.params.id);

  if (info.changes === 0) {
    flash(req, 'error', 'Già gestita da un altro moderatore (oppure non esiste più).');
  } else {
    flash(req, 'success', azione === 'approved'
      ? (bonus !== 0 ? `Approvata ✅ con ${bonus > 0 ? '+' : ''}${bonus} punti bonus` : 'Approvata ✅')
      : 'Rifiutata ❌');
    // Notifica push all'utente quando la sua prova viene approvata (punti accreditati)
    if (azione === 'approved') {
      const sub = db.prepare(`SELECT s.user_id, m.title, m.points
        FROM submissions s JOIN missions m ON m.id = s.mission_id WHERE s.id = ?`).get(req.params.id);
      if (sub) {
        // Il bonus entra in points_adjust: stessa valuta della classifica, dei
        // giochi e della ruota. Si accredita solo approvando — su un rifiuto
        // non ci sarebbe niente da premiare.
        if (bonus !== 0) {
          punti.muovi(sub.user_id, bonus, 'moderazione', `${req.currentUser.nickname} su «${sub.title}»`);
          audit(req, 'prova.bonus', `#${req.params.id} «${sub.title}» ${bonus > 0 ? '+' : ''}${bonus}pt`);
        }
        const totale = sub.points + bonus;
        pushToUser(sub.user_id, {
          title: '✅ Missione approvata!',
          body: bonus !== 0
            ? `«${sub.title}» validata: +${totale} punti (${sub.points} + ${bonus} di bonus)!`
            : `«${sub.title}» validata: +${sub.points} punti!`,
          url: '/classifica',
        }).catch((e) => console.error('[PUSH] approvazione', e.message));

        // Questa approvazione può aver completato una sezione → bonus una tantum
        awardSectionsAndNotify(sub.user_id, req);
        checkLevelUp(sub.user_id);
        // I punti delle missioni stanno in submissions, non in points_adjust:
        // sono gli unici che non passano da punti.muovi, quindi la soglia
        // dell'invito va controllata anche qui — ed è la strada più probabile
        // per arrivare a 350.
        inviti.verificaSoglia(sub.user_id);
      }
    } else {
      // Rifiutata: avvisiamo lo stesso, altrimenti l'utente resta ad aspettare
      // una prova che non arriverà mai. Il tono è leggero — è un gioco di paese,
      // non una bocciatura — e se il moderatore ha scritto un motivo lo
      // riportiamo: senza, la persona non sa cosa correggere.
      const sub = db.prepare(`SELECT s.user_id, s.mission_id, m.title
        FROM submissions s JOIN missions m ON m.id = s.mission_id WHERE s.id = ?`).get(req.params.id);
      if (sub) {
        pushToUser(sub.user_id, {
          title: 'Prova non validata',
          body: reviewNote
            ? `«${sub.title}»: ${reviewNote}`
            : `«${sub.title}» non è stata validata. Puoi riprovare!`,
          url: `/missioni/${sub.mission_id}`,   // porta dritto a rifarla
        }).catch((e) => console.error('[PUSH] rifiuto', e.message));
      }
    }
  }
  // Torna alla PAGINA da cui si è approvato, non alla prima. Il form manda il
  // numero in `p`: senza, un moderatore a pagina 19 si ritrovava a pagina 1 a
  // ogni approvazione, e per riprendere doveva riscendere ogni volta.
  // Si valida come intero: `p` arriva dal browser e non ci si fida mai. La
  // rotta GET riporta comunque nei limiti se la pagina nel frattempo non
  // esiste più (l'ultima prova approvata può averla svuotata).
  const pag = parseInt(req.body.p, 10);
  res.redirect(Number.isInteger(pag) && pag > 1 ? `/moderazione?p=${pag}` : '/moderazione');
});

// =========================================================================
//  ADMIN (gestione missioni + ruoli)
// =========================================================================
// ── Codici premio monouso (link/QR) ─────────────────────────────────────
// Il PRIMO utente loggato che apre /r/<code> riscatta i punti; i successivi no.
app.get('/r/:code', (req, res) => {
  const code = String(req.params.code || '').trim().slice(0, 64);
  const rc = db.prepare('SELECT * FROM reward_codes WHERE code = ?').get(code);
  if (!rc) return res.status(404).render('claim', { title: 'Codice premio', outcome: 'invalid', rc: null });

  if (!req.currentUser) {
    req.session.returnTo = '/r/' + encodeURIComponent(code);   // torna qui dopo il login
    flash(req, 'error', 'Accedi (o registrati) per riscattare il premio.');
    return res.redirect('/login');
  }
  // Già riscattato da me in precedenza
  if (rc.claimed_by === req.currentUser.id) {
    return res.render('claim', { title: 'Premio', outcome: 'mine', rc });
  }
  // Riscatto atomico: va a buon fine solo se nessuno l'ha ancora preso
  const upd = db.prepare("UPDATE reward_codes SET claimed_by = ?, claimed_at = datetime('now') WHERE code = ? AND claimed_by IS NULL")
    .run(req.currentUser.id, code);
  if (upd.changes === 1) {
    punti.muovi(req.currentUser.id, rc.points, 'codice', `Codice ${code}`);
    checkLevelUp(req.currentUser.id);
    return res.render('claim', { title: 'Premio riscattato!', outcome: 'won', rc, balance: userPoints(req.currentUser.id) });
  }
  // Qualcun altro è arrivato prima
  return res.render('claim', { title: 'Premio', outcome: 'used', rc });
});

// ── Statistiche (admin): aggregati anonimi, filtrabili per periodo ─────────
// =========================================================================
//  Export CSV dei metadati delle prove
//  ------------------------------------------------------------------------
//  La foto arriva su disco COM'È: multer la scrive senza ricodificarla e jimp
//  la apre solo in lettura per l'impronta. Quindi l'EXIF che il telefono ha
//  messo dentro è ancora lì, e da lì si legge quando è stato fatto lo scatto.
//  Attenzione però: quasi nessuna foto ce l'ha. Basta che passi da WhatsApp,
//  che sia uno screenshot o che la galleria la ripulisca, e i metadati non
//  esistono più prima ancora di arrivare a noi. La colonna `data_scatto`
//  resterà vuota nella maggior parte delle righe: non è un bug dell'export.
// =========================================================================
//  NOTA sul ridimensionamento: da quando le foto vengono rimpicciolite al
//  caricamento, nel file l'EXIF non c'e' piu' — ricodificare lo cancella. La
//  data viene percio' letta e salvata in submissions.shot_at al momento
//  dell'invio, e l'export la prende da li'. Per le foto vecchie, caricate
//  prima del ridimensionamento, si continua a leggerla dal file.

// Una cella CSV: le virgolette si raddoppiano, e si quota sempre così nessun
// nickname con la virgola o il punto e virgola può spostare le colonne.
const csvCella = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

app.get('/admin/prove.csv', auth.requireAdmin, (req, res) => {
  const righe = db.prepare(`
    SELECT s.id, s.created_at, s.status, s.photo_path, s.note, s.phash, s.shot_at,
           s.reviewed_at, u.nickname, m.title AS missione, m.points
    FROM submissions s
    LEFT JOIN users u   ON u.id = s.user_id
    LEFT JOIN missions m ON m.id = s.mission_id
    ORDER BY s.id
  `).all();

  const intestazioni = ['id', 'inviata_il', 'stato', 'utente', 'missione', 'punti',
    'data_scatto', 'scatto_esatto', 'ore_fra_scatto_e_invio', 'scattata_prima_della_festa',
    'dispositivo', 'gps', 'file', 'impronta', 'moderata_il', 'nota'];
  // Il BOM serve a Excel: senza, apre il CSV in latin-1 e le accentate si
  // rompono. Gli altri fogli di calcolo lo ignorano.
  const out = ['﻿' + intestazioni.join(';')];

  // Stessa data d'inizio di tutto il resto: vedi lib/modalita.js.
  const INIZIO_FESTA = new Date(modalita.INIZIO_GIOCO.iso);
  for (const r of righe) {
    const nome = path.basename(r.photo_path || '');
    // Prima la colonna (foto nuove, gia' rimpicciolite), poi il file (foto
    // vecchie): cosi' l'export continua a funzionare su entrambe.
    const daFile = nome ? datiScatto(path.join(UPLOADS_DIR, nome)) : { scatto: null, esatta: false, dispositivo: '', gps: false };
    const ex = r.shot_at
      ? { ...daFile, scatto: new Date(r.shot_at.replace(' ', 'T') + 'Z'), esatta: true }
      : daFile;
    const inviata = r.created_at ? new Date(r.created_at.replace(' ', 'T') + 'Z') : null;
    // Quanto tempo passa fra lo scatto e l'invio: se sono giorni, la foto è
    // stata ripescata dalla galleria invece che fatta sul momento.
    const ore = (ex.scatto && inviata)
      ? Math.round(((inviata - ex.scatto) / 3600000) * 10) / 10 : '';
    out.push([
      r.id,
      r.created_at || '',
      r.status || '',
      r.nickname || '(utente eliminato)',
      r.missione || '(missione eliminata)',
      r.points ?? '',
      ex.scatto ? ex.scatto.toISOString().slice(0, 19).replace('T', ' ') : '',
      ex.scatto ? (ex.esatta ? 'sì' : 'approssimata') : '',
      ore,
      ex.scatto ? (ex.scatto < INIZIO_FESTA ? 'sì' : 'no') : '',
      ex.dispositivo,
      ex.scatto || ex.dispositivo ? (ex.gps ? 'sì' : 'no') : '',
      nome,
      r.phash || '',
      r.reviewed_at || '',
      (r.note || '').replace(/[\r\n]+/g, ' '),
    ].map(csvCella).join(';'));
  }

  const oggi = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="prove-fantasanrocco-${oggi}.csv"`);
  res.send(out.join('\r\n'));
});

// Storico dei punti di un utente. Serve quando un punteggio non torna e
// bisogna capire com'e' cresciuto: da qui si vede riga per riga.
app.get('/admin/punti/:id', auth.requireAdmin, (req, res) => {
  const u = db.prepare('SELECT id, nickname, email, role, points_adjust, created_at FROM users WHERE id = ?')
    .get(req.params.id);
  if (!u) return res.status(404).render('error', { title: 'Storico', message: 'Utente inesistente.' });
  res.render('admin-punti', {
    title: `Storico punti · ${u.nickname}`,
    utente: u,
    totale: userPoints(u.id),
    voci: punti.storico(u.id),
    riepilogo: punti.riepilogo(u.id),
    // Quanto del saldo non e' spiegato dal registro: sui conti piu' vecchi
    // del registro stesso e' normale che resti un pezzo scoperto.
    nonSpiegato: punti.nonSpiegato(u.id),
  });
});

app.get('/admin/statistiche', auth.requireAdmin, (req, res) => {
  const RANGES = [
    { key: '1', label: 'Ieri', days: 1 },
    { key: '7', label: '7 giorni', days: 7 },
    { key: '15', label: '15 giorni', days: 15 },
    { key: '30', label: '30 giorni', days: 30 },
    { key: 'all', label: 'Sempre', days: null },
  ];
  const range = RANGES.find((r) => r.key === String(req.query.range)) || RANGES[1];
  const days = range.days;                       // null = tutto
  // "since" come stringa UTC confrontabile con created_at (datetime('now') = UTC)
  const since = days ? new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ') : null;
  const F = since ? ' AND created_at >= @since' : '';
  const P = { since };
  const one = (sql, p) => { try { return (db.prepare(sql).get(p || P) || {}).n || 0; } catch { return 0; } };
  // Le query di dettaglio non devono poter far cadere l'intera pagina: se una
  // tabella non c'è ancora (installazione fresca) la sua sezione resta vuota.
  const many = (sql, p) => { try { return db.prepare(sql).all(p || P); } catch { return []; } };
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

  // ══ 1. COLPO D'OCCHIO ═══════════════════════════════════════════════════
  const kpi = {
    newUsers:    one(`SELECT COUNT(*) n FROM users WHERE 1=1${F}`),
    totalUsers:  one('SELECT COUNT(*) n FROM users'),
    subs:        one(`SELECT COUNT(*) n FROM submissions WHERE 1=1${F}`),
    approved:    one(`SELECT COUNT(*) n FROM submissions WHERE status='approved'${F}`),
    pending:     one(`SELECT COUNT(*) n FROM submissions WHERE status='pending'${F}`),
    rejected:    one(`SELECT COUNT(*) n FROM submissions WHERE status='rejected'${F}`),
    stories:     one(`SELECT COUNT(*) n FROM stories WHERE 1=1${F}`),
    votes:       one(`SELECT COUNT(*) n FROM prediction_votes WHERE 1=1${F}`)
                 + one(`SELECT COUNT(*) n FROM palio_predictions WHERE 1=1${F}`),
  };
  kpi.activeUsers = one(`SELECT COUNT(*) n FROM (
      SELECT user_id FROM submissions WHERE 1=1${F}
      UNION SELECT user_id FROM stories WHERE 1=1${F})`);
  const RF = since ? ' AND s.reviewed_at >= @since' : '';
  kpi.missionPoints = (db.prepare(`SELECT COALESCE(SUM(m.points),0) n FROM submissions s
      JOIN missions m ON m.id = s.mission_id WHERE s.status='approved'${RF}`).get(P) || {}).n || 0;
  // Quota di iscritti che ha mandato almeno una prova: dice quanti si sono
  // registrati e poi sono spariti, che il totale iscritti da solo nasconde.
  kpi.everPlayed = one(`SELECT COUNT(DISTINCT user_id) n FROM submissions`);
  kpi.tassoAttivazione = pct(kpi.everPlayed, kpi.totalUsers);

  // ══ 2. ANDAMENTO NEL TEMPO ══════════════════════════════════════════════
  const nDays = days || 30;                       // "tutto" → mostra ultimi 30 gg
  const serie = (sql) => {
    const m = {};
    for (const r of many(sql, [`-${nDays} days`])) m[r.d] = r.c;
    return m;
  };
  const mSubs  = serie(`SELECT date(created_at) d, COUNT(*) c FROM submissions WHERE created_at >= datetime('now', ?) GROUP BY d`);
  const mUsers = serie(`SELECT date(created_at) d, COUNT(*) c FROM users       WHERE created_at >= datetime('now', ?) GROUP BY d`);
  const mRuns  = serie(`SELECT date(created_at) d, COUNT(*) c FROM game_runs   WHERE created_at >= datetime('now', ?) GROUP BY d`);
  const series = [];
  for (let i = nDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    series.push({
      date: d, label: d.slice(8) + '/' + d.slice(5, 7),
      subs: mSubs[d] || 0, users: mUsers[d] || 0, runs: mRuns[d] || 0,
    });
  }
  // Ore del giorno in cui si gioca (UTC+2 = ora italiana d'estate, la festa è
  // ad agosto): serve a capire quando ha senso mandare le notifiche push.
  const oreRaw = many(`SELECT CAST(strftime('%H', datetime(created_at, '+2 hours')) AS INTEGER) h, COUNT(*) c
      FROM submissions WHERE 1=1${F} GROUP BY h`);
  const oreMap = Object.fromEntries(oreRaw.map((r) => [r.h, r.c]));
  const orario = Array.from({ length: 24 }, (_, h) => ({ h, c: oreMap[h] || 0 }));

  // ══ 3. MISSIONI ═════════════════════════════════════════════════════════
  const SF = since ? ' AND s.created_at >= @since' : '';
  const topMissions = many(`SELECT m.title, COUNT(*) c FROM submissions s
      JOIN missions m ON m.id = s.mission_id
      WHERE s.status='approved' AND m.game_key IS NULL${SF}
      GROUP BY s.mission_id ORDER BY c DESC LIMIT 10`);
  // Missioni foto MAI completate: sono quelle da spingere o da riscrivere
  const missioniMorte = many(`SELECT m.title, m.points FROM missions m
      WHERE m.game_key IS NULL AND m.archived = 0
        AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.mission_id = m.id AND s.status='approved')
      ORDER BY m.points DESC, m.title LIMIT 12`);
  const perRarita = many(`SELECT m.points p, COUNT(*) c FROM submissions s
      JOIN missions m ON m.id = s.mission_id
      WHERE s.status='approved' AND m.game_key IS NULL${SF}
      GROUP BY m.points ORDER BY m.points`);
  const perSezione = many(`SELECT COALESCE(m.section,'—') sez, COUNT(*) c,
             COUNT(DISTINCT s.user_id) u
      FROM submissions s JOIN missions m ON m.id = s.mission_id
      WHERE s.status='approved' AND m.game_key IS NULL${SF}
      GROUP BY m.section ORDER BY c DESC`);
  const missioniTot = one('SELECT COUNT(*) n FROM missions WHERE game_key IS NULL AND archived = 0');
  const missioniViste = one(`SELECT COUNT(DISTINCT s.mission_id) n FROM submissions s
      JOIN missions m ON m.id = s.mission_id WHERE s.status='approved' AND m.game_key IS NULL`);

  // ══ 4. MODERAZIONE ══════════════════════════════════════════════════════
  // Tempo di risposta = reviewed_at - created_at, in minuti. La mediana dice
  // più della media: una prova dimenticata per due giorni sposta la media e
  // fa sembrare lento un lavoro che di solito è immediato.
  const attese = many(`SELECT (julianday(reviewed_at) - julianday(created_at)) * 1440 AS min
      FROM submissions WHERE reviewed_at IS NOT NULL AND status <> 'pending'${F}
      ORDER BY min`).map((r) => r.min).filter((v) => v >= 0);
  const mediana = (a) => (a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : 0);
  const moderazione = {
    decise:     attese.length,
    mediaMin:   attese.length ? Math.round(attese.reduce((x, y) => x + y, 0) / attese.length) : 0,
    medianaMin: Math.round(mediana(attese)),
    peggioreMin: attese.length ? Math.round(attese[attese.length - 1]) : 0,
    tassoOk:    pct(kpi.approved, kpi.approved + kpi.rejected),
    arretrato:  one("SELECT COUNT(*) n FROM submissions WHERE status='pending'"),
    piuVecchia: (db.prepare(`SELECT CAST((julianday('now') - julianday(created_at)) * 24 AS INTEGER) n
                             FROM submissions WHERE status='pending' ORDER BY created_at LIMIT 1`).get() || {}).n || 0,
  };
  const moderatori = many(`SELECT u.nickname,
        COUNT(*) c,
        SUM(CASE WHEN s.status='approved' THEN 1 ELSE 0 END) ok,
        SUM(CASE WHEN s.status='rejected' THEN 1 ELSE 0 END) ko
      FROM submissions s JOIN users u ON u.id = s.reviewed_by
      WHERE s.reviewed_by IS NOT NULL${since ? ' AND s.reviewed_at >= @since' : ''}
      GROUP BY s.reviewed_by ORDER BY c DESC LIMIT 10`);
  const motiviRifiuto = many(`SELECT COALESCE(NULLIF(TRIM(review_note),''),'(senza motivo)') nota, COUNT(*) c
      FROM submissions WHERE status='rejected'${F} GROUP BY nota ORDER BY c DESC LIMIT 8`);

  // ══ 5. GIOCHI ═══════════════════════════════════════════════════════════
  // Da qui in giù i dati arrivano da game_runs, che si riempie solo dalle
  // partite giocate DOPO l'introduzione della tabella: prima le durate non
  // venivano salvate da nessuna parte. `dallo` dice da quando si misura.
  const GIOCHI = [
    { key: 'runner',  nome: 'Corri San Rocco',  unita: 'punti', link: '/giochi?g=runner' },
    { key: 'jetpack', nome: 'San Rocco Jetpack', unita: 'metri', link: '/giochi?g=jetpack' },
  ];
  const giochi = GIOCHI.map((g) => {
    const p = { since, g: g.key };
    const GF = since ? ' AND created_at >= @since' : '';
    const durate = many(`SELECT seconds s FROM game_runs WHERE game = @g${GF} ORDER BY s`, p).map((r) => r.s);
    const r = db.prepare(`SELECT COUNT(*) partite, COUNT(DISTINCT user_id) giocatori,
             COALESCE(SUM(seconds),0) totSec, COALESCE(AVG(seconds),0) mediaSec,
             COALESCE(MAX(seconds),0) maxSec, COALESCE(AVG(score),0) mediaScore,
             COALESCE(MAX(score),0) maxScore
        FROM game_runs WHERE game = @g${GF}`).get(p) || {};
    // Istogramma delle durate: dice se si fanno tante partite lampo o poche
    // lunghe, cosa che media e record da soli non raccontano.
    const FASCE = [
      { label: '0-10 s', min: 0, max: 10 },
      { label: '10-30 s', min: 10, max: 30 },
      { label: '30-60 s', min: 30, max: 60 },
      { label: '1-2 min', min: 60, max: 120 },
      { label: '2-5 min', min: 120, max: 300 },
      { label: 'oltre 5 min', min: 300, max: Infinity },
    ].map((f) => ({ label: f.label, c: durate.filter((s) => s >= f.min && s < f.max).length }));
    return {
      ...g,
      partite: r.partite || 0,
      giocatori: r.giocatori || 0,
      totSec: Math.round(r.totSec || 0),
      mediaSec: Math.round(r.mediaSec || 0),
      medianaSec: Math.round(mediana(durate)),
      maxSec: Math.round(r.maxSec || 0),
      mediaScore: Math.round(r.mediaScore || 0),
      maxScore: Math.round(r.maxScore || 0),
      fasce: FASCE,
      top: many(`SELECT u.nickname, COUNT(*) partite, ROUND(SUM(gr.seconds)) sec
          FROM game_runs gr JOIN users u ON u.id = gr.user_id
          WHERE gr.game = @g${since ? ' AND gr.created_at >= @since' : ''}
          GROUP BY gr.user_id ORDER BY sec DESC LIMIT 8`, p),
    };
  });
  const giochiDallo = (db.prepare('SELECT MIN(created_at) d FROM game_runs').get() || {}).d || null;
  // I contatori storici in users restano l'unica fonte per il "prima": non
  // hanno durate, ma dicono quante partite in totale sono state giocate.
  const contatoriStorici = db.prepare(`SELECT
        COALESCE(SUM(game_plays),0) runnerPartite, COALESCE(MAX(game_best),0) runnerRecord,
        COALESCE(SUM(jp_plays),0)   jetpackPartite, COALESCE(MAX(jp_best),0)  jetpackRecord,
        COALESCE(SUM(jp_stars),0)   stelle,
        COUNT(CASE WHEN game_plays > 0 THEN 1 END) runnerGiocatori,
        COUNT(CASE WHEN jp_plays  > 0 THEN 1 END) jetpackGiocatori
      FROM users`).get() || {};

  // ══ 6. PUNTI E LIVELLI ══════════════════════════════════════════════════
  const classifica = leaderboardRows();
  const distLivelli = LEVELS.map((l) => ({ lv: l.lv, title: l.title, at: l.at, c: 0 }));
  for (const u of classifica) {
    let idx = 0;
    for (let i = 0; i < LEVELS.length; i++) if (u.points >= LEVELS[i].at) idx = i;
    distLivelli[idx].c++;
  }
  const puntiTot = classifica.reduce((a, u) => a + u.points, 0);
  const punti = {
    totale: puntiTot,
    media: classifica.length ? Math.round(puntiTot / classifica.length) : 0,
    mediana: Math.round(mediana(classifica.map((u) => u.points).sort((a, b) => a - b))),
    daMissioni: one(`SELECT COALESCE(SUM(m.points),0) n FROM submissions s
        JOIN missions m ON m.id = s.mission_id WHERE s.status='approved' AND m.game_key IS NULL`),
    daGiochi: one(`SELECT COALESCE(SUM(m.points),0) n FROM submissions s
        JOIN missions m ON m.id = s.mission_id WHERE s.status='approved' AND m.game_key IS NOT NULL`),
    // points_adjust è un unico numero che accumula ruota, slot, striscia,
    // codici e correzioni admin: non è scomponibile, e va detto.
    adjust: one("SELECT COALESCE(SUM(points_adjust),0) n FROM users WHERE role='user'"),
    aZero: classifica.filter((u) => u.points <= 0).length,
  };

  // ══ 7. UTENTI ═══════════════════════════════════════════════════════════
  const utenti = {
    totali:    kpi.totalUsers,
    admin:     one("SELECT COUNT(*) n FROM users WHERE role <> 'user'"),
    conAvatar: one('SELECT COUNT(*) n FROM users WHERE avatar_path IS NOT NULL'),
    con2fa:    one('SELECT COUNT(*) n FROM users WHERE totp_enabled = 1'),
    conEmail:  one("SELECT COUNT(*) n FROM users WHERE email IS NOT NULL AND email <> ''"),
    push:      one('SELECT COUNT(DISTINCT user_id) n FROM push_subscriptions'),
    privacy:   one('SELECT COUNT(*) n FROM users WHERE privacy_accepted_at IS NOT NULL'),
    strisceVive: one("SELECT COUNT(*) n FROM users WHERE streak_day > 0 AND streak_last_day >= date('now','-1 day')"),
    strisciaMax: one('SELECT COALESCE(MAX(streak_day),0) n FROM users'),
    bonusSezione: one('SELECT COUNT(*) n FROM section_bonuses'),
    codiciUsati: one('SELECT COUNT(*) n FROM reward_codes WHERE claimed_by IS NOT NULL'),
    codiciTot:   one('SELECT COUNT(*) n FROM reward_codes'),
  };
  const topUsers = many(`SELECT u.nickname, COUNT(*) c FROM submissions s
      JOIN users u ON u.id = s.user_id
      WHERE 1=1${SF} GROUP BY s.user_id ORDER BY c DESC LIMIT 10`);

  // ══ 8. COINVOLGIMENTO ═══════════════════════════════════════════════════
  const coinvolgimento = {
    pronostici:   one('SELECT COUNT(*) n FROM predictions'),
    votiPronost:  one(`SELECT COUNT(*) n FROM prediction_votes WHERE 1=1${F}`),
    votantiPron:  one(`SELECT COUNT(DISTINCT user_id) n FROM prediction_votes WHERE 1=1${F}`),
    votiPalio:    one(`SELECT COUNT(*) n FROM palio_predictions WHERE 1=1${F}`),
    storie:       one(`SELECT COUNT(*) n FROM stories WHERE 1=1${F}`),
    storieVive:   one("SELECT COUNT(*) n FROM stories WHERE expires_at > datetime('now') AND hidden = 0"),
    vistePerStoria: 0,
    segnalazioni: one('SELECT COUNT(*) n FROM story_reports'),
  };
  const nStorie = one('SELECT COUNT(*) n FROM stories');
  coinvolgimento.vistePerStoria = nStorie
    ? Math.round((one('SELECT COUNT(*) n FROM story_views') / nStorie) * 10) / 10 : 0;

  // ══ 9. DA DOVE ARRIVANO I PUNTI, VOCE PER VOCE ══════════════════════════
  // Il registro dei movimenti (punti_movimenti) rende scomponibile quello che
  // prima era un numero solo. `punti` qui dentro è la scheda della pagina e
  // copre il modulo: il require è la strada per arrivare alla libreria.
  const mediaPunti = require('./lib/punti').riepilogoGlobale();
  // La torta mostra solo quello che il registro sa spiegare. I saldi mossi
  // prima che il registro esistesse restano fuori: erano una fetta muta —
  // nessuna causa, niente da cliccare — che rubava spazio alle voci vere.
  // Le percentuali si leggono quindi sul totale spiegato, non sul saldo.

  res.render('statistiche', {
    title: 'Statistiche', ranges: RANGES, range, mediaPunti,
    kpi, series, orario, topMissions, topUsers,
    missioniMorte, perRarita, perSezione, missioniTot, missioniViste,
    moderazione, moderatori, motiviRifiuto,
    giochi, giochiDallo, contatoriStorici,
    distLivelli, punti, utenti, coinvolgimento,
    SECTIONS,
  });
});

// La pagina è aperta a tutto lo staff, ma i moderatori vedono SOLO le
// missioni. Non è una questione di nascondere riquadri: i dati che non
// devono vedere (utenti con le loro email, codici premio, backup, registro
// azioni, storie segnalate) non vengono proprio interrogati, così non
// finiscono nemmeno nel sorgente della pagina. Le rotte che modificano
// quelle cose restano tutte requireAdmin.
app.get('/admin', auth.requireStaff, async (req, res) => {
  const soloMissioni = req.currentUser.role !== 'admin';
  // "locked" qui = non archiviata ma con una finestra futura (active_from):
  // sulla pagina pubblica è quella che esce sfocata, solo rarità visibile.
  // Diverso da "archived" (flash/manuale: del tutto invisibile). Nel
  // pannello i due stati hanno un'icona diversa, altrimenti si confondono.
  const missions = db.prepare('SELECT * FROM missions ORDER BY id DESC').all()
    .map((m) => ({ ...m, locked: !m.archived && missionState(m) === 'locked' }));

  // Le missioni raggruppate per GIORNO, in ordine crescente. Prima erano
  // elencate per id, cioè nell'ordine in cui qualcuno le ha scritte: per
  // trovare quelle di stasera bisognava scorrere tutto. Le flash ci sono
  // sempre state (la query non filtra archived) ma in mezzo a quel mucchio
  // non le vedeva nessuno: dentro al loro giorno si trovano.
  //
  // Il giorno di riferimento è quello in cui la missione si può ancora fare:
  // per un pronostico che apre il 13 alle 18 e chiude il 14 alle 18, il
  // giorno è il 14, non il 13.
  const giornoDiFesta = (m) => {
    if (m.giorni_attivi) {
      const g = String(m.giorni_attivi).split(',').map((x) => parseInt(x, 10)).filter(Number.isInteger);
      if (g.length) return Math.min(...g);
    }
    const quando = m.active_to || m.active_from;
    if (!quando) return null;
    const g = parseInt(String(quando).slice(8, 10), 10);
    return Number.isInteger(g) ? g : null;
  };
  const perGiorno = new Map();
  const sempre = [];
  const flashSenzaData = [];
  for (const m of missions) {
    const g = giornoDiFesta(m);
    if (g === null) {
      // Le flash senza data vanno in un gruppo loro. Se restassero mescolate
      // alle fisse sparirebbero in un elenco di centocinquanta righe, ed è
      // proprio quello che rendeva impossibile trovarle.
      (m.archived ? flashSenzaData : sempre).push(m);
      continue;
    }
    if (!perGiorno.has(g)) perGiorno.set(g, []);
    perGiorno.get(g).push(m);
  }
  const gruppiMissioni = [...perGiorno.keys()]
    .sort((a, b) => a - b)
    .map((g) => ({ etichetta: `${g} agosto`, giorno: g, missioni: perGiorno.get(g) }));
  // Quelle senza data in testa: sono lo zoccolo che vale tutta la settimana.
  if (sempre.length) {
    gruppiMissioni.unshift({ etichetta: 'Senza data — valgono tutta la settimana', giorno: null, missioni: sempre });
  }
  if (flashSenzaData.length) {
    gruppiMissioni.push({ etichetta: 'Flash senza data — le sblocca lo staff a mano', giorno: null, missioni: flashSenzaData });
  }
  const host = req.get('host') || '';
  const baseUrl = (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https') + '://' + host;

  // Da qui in giù è roba da admin. Per un moderatore restano tutti vuoti:
  // non è una tenda davanti ai dati, è che i dati non vengono letti.
  let users = [], codes = [], backups = [], auditLog = [], reportedStories = [], classificaInviti = [], emailBloccate = [];
  // Le segnalazioni le legge anche il moderatore: sono il canale con cui gli
  // utenti dicono che qualcosa non va, e chi sta in prima linea a moderare e'
  // proprio quello che deve accorgersene. Non contengono dati riservati —
  // nickname e testo, non email.
  const segnalazioni = db.prepare('SELECT * FROM segnalazioni ORDER BY letta ASC, id DESC LIMIT 100').all();
  if (!soloMissioni) {
    // Ordine di iscrizione, l'ultimo arrivato in cima. In ordine alfabetico
    // (com'era prima) chi si e' appena iscritto finiva sepolto in mezzo, e
    // gli arrivi in blocco — quelli che vale la pena guardare — non si
    // vedevano affatto. A parita' di secondo decide l'id, che e' l'ordine
    // vero di iscrizione: created_at ha la precisione del secondo e in una
    // raffica di registrazioni diverse righe portano la stessa ora.
    users = db.prepare('SELECT id, nickname, email, role, created_at FROM users ORDER BY created_at DESC, id DESC').all()
      .map((u) => ({ ...u, points: userPoints(u.id) }));
    // Chi guadagna di piu' dagli inviti, con l'elenco di chi ha portato:
    // serve a riconoscere chi si fabbrica gli amici da solo.
    classificaInviti = inviti.classifica(20);
    emailBloccate = bloccoEmail.elenco();
    const codesRaw = db.prepare(`SELECT c.*, u.nickname AS claimer
      FROM reward_codes c LEFT JOIN users u ON u.id = c.claimed_by
      ORDER BY c.created_at DESC`).all();
    // Genera il QR (SVG) di ogni codice lato server: pronto da stampare, niente link da copiare
    codes = await Promise.all(codesRaw.map(async (c) => {
      const url = baseUrl + '/r/' + c.code;
      let qrSvg = '';
      try { qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }); } catch (e) {}
      return { ...c, url, qrSvg };
    }));
    backups = fs.readdirSync(BACKUPS_DIR)
      .filter((f) => f.endsWith('.db'))
      .map((f) => { const s = fs.statSync(path.join(BACKUPS_DIR, f)); return { name: f, size: s.size, mtime: s.mtimeMs }; })
      .sort((a, b) => b.mtime - a.mtime);
    auditLog = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 100').all();
    reportedStories = db.prepare(`SELECT s.id, s.media_path, s.hidden, u.nickname AS author,
        COUNT(r.id) AS reports
      FROM stories s JOIN users u ON u.id = s.user_id
      JOIN story_reports r ON r.story_id = s.id
      GROUP BY s.id ORDER BY reports DESC, s.id DESC`).all();
  }
  // Pronostico Palio dei Fuochi: stato + distribuzione voti
  const pst = soloMissioni ? { open: 0, winner: null, points: 0, closes_at: null } : palioState();
  const counts = soloMissioni ? PALIO_FUOCHISTI.map(() => 0) : palioVoteCounts();
  const totalVotes = counts.reduce((a, b) => a + b, 0);
  const pronostico = {
    open: !!pst.open,
    winner: pst.winner,
    points: pst.points,
    resolved: pst.winner !== null,
    totalVotes,
    closesAt: pst.closes_at,
    fuochisti: PALIO_FUOCHISTI.map((f, i) => ({ name: f.name, short: palioShortName(f.name), votes: counts[i] })),
  };
  // Pronostici generici: elenco con opzioni, voti e stato
  const predictions = soloMissioni ? [] : db.prepare('SELECT * FROM predictions ORDER BY (winner IS NOT NULL), id DESC').all().map((p) => {
    const opts = predOptions(p);
    const vc = predVoteCounts(p.id, opts.length);
    return {
      id: p.id, title: p.title, description: p.description || '', points: p.points, multi: !!p.multi,
      open: !!p.open, winner: p.winner, resolved: p.winner !== null, archived: !!p.archived,
      totalVotes: vc.reduce((a, b) => a + b, 0),
      options: opts.map((name, i) => ({ name, votes: vc[i] })),
      closesAt: p.closes_at,
    };
  });
  res.render('admin', { title: 'Admin', missions, gruppiMissioni, users, codes, baseUrl, backups, auditLog, reportedStories, pronostico, predictions,
    classificaInviti, puntiInvito: inviti.PUNTI_INVITO,
    sogliaInvito: inviti.SOGLIA_INVITO, emailBloccate,
    sezioni: SECTIONS, notifSubmissions: !!req.currentUser.notif_submissions, soloMissioni,
    iscrizioniQuando: modalita.quando(),
    segnalazioni });
});

app.post('/admin/segnalazioni/:id/letta', auth.requireStaff, (req, res) => {
  db.prepare('UPDATE segnalazioni SET letta = 1 - letta WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

app.post('/admin/codici', auth.requireAdmin, (req, res) => {
  const points = parseInt(req.body.points, 10);
  if (!Number.isFinite(points) || points <= 0) { flash(req, 'error', 'Inserisci un numero di punti valido.'); return res.redirect('/admin'); }
  let qty = parseInt(req.body.quantity, 10);
  if (!Number.isFinite(qty) || qty < 1) qty = 1;
  qty = Math.min(qty, 100);                              // limite di sicurezza
  const label = (req.body.label || '').trim().slice(0, 120) || null;
  const ins = db.prepare('INSERT INTO reward_codes (code, points, label) VALUES (?, ?, ?)');
  db.transaction(() => {
    for (let i = 0; i < qty; i++) ins.run(crypto.randomBytes(5).toString('hex'), points, label);
  })();
  audit(req, 'codici.crea', `${qty}× ${points}pt${label ? ' "' + label + '"' : ''}`);
  flash(req, 'success', `Creat${qty === 1 ? 'o' : 'i'} ${qty} codic${qty === 1 ? 'e' : 'i'} premio da ${points} punti. Ogni QR vale una sola persona.`);
  res.redirect('/admin');
});

app.post('/admin/codici/:code/elimina', auth.requireAdmin, (req, res) => {
  db.prepare('DELETE FROM reward_codes WHERE code = ?').run(req.params.code);
  audit(req, 'codici.elimina', req.params.code);
  flash(req, 'success', 'Codice premio eliminato.');
  res.redirect('/admin');
});

// Invia una notifica push a tutti gli iscritti (es. "Palio dei Fuochi tra 30 min").
app.post('/admin/push', auth.requireAdmin, async (req, res) => {
  const title = (req.body.title || '').trim().slice(0, 80) || 'FantaSanRocco';
  const body = (req.body.body || '').trim().slice(0, 180);
  let url = (req.body.url || '/').trim().slice(0, 200) || '/';
  if (!/^\/[A-Za-z0-9/_-]*$/.test(url)) url = '/';   // solo percorsi interni
  if (!body) { flash(req, 'error', 'Scrivi il testo della notifica.'); return res.redirect('/admin'); }
  let n = 0;
  try { n = await pushBroadcast({ title, body, url }); } catch (e) { console.error('[PUSH] broadcast', e.message); }
  audit(req, 'push.invia', `"${title}: ${body}" -> ${n} dispositivi`);
  flash(req, 'success', `Notifica inviata a ${n} dispositiv${n === 1 ? 'o' : 'i'}.`);
  res.redirect('/admin');
});

// Preferenza personale dello staff: ricevere o no la notifica quando un utente
// carica una prova (categoria separata dalle notifiche normali).
app.post('/admin/notifiche-prove', auth.requireAdmin, (req, res) => {
  const on = req.body.notif_submissions ? 1 : 0;
  db.prepare('UPDATE users SET notif_submissions = ? WHERE id = ?').run(on, req.currentUser.id);
  flash(req, 'success', on ? 'Riceverai una notifica a ogni nuova prova caricata.' : 'Non riceverai più le notifiche delle nuove prove.');
  res.redirect('/admin');
});

// ── Uscita di una missione: dall'archivio al pubblico ──────────────────────
// Due strade, stesso risultato: la spunta "archiviata" tolta a mano, oppure
// l'orario programmato che scade. In entrambi i casi parte lo stesso annuncio,
// così una missione flash non compare mai in silenzio.
function missionAnnouncement(m) {
  return {
    title: '🚨 Nuova missione disponibile!',
    body: `${m.title} · ${m.points} punti`,
    url: '/missioni',
    tag: 'missione-' + m.id,   // sostituisce l'avviso precedente della stessa missione
  };
}
function announceMission(m) {
  pushBroadcast(missionAnnouncement(m))
    .then((n) => console.log(`[MISSIONI] «${m.title}» annunciata a ${n} dispositivi`))
    .catch((e) => console.error('[PUSH] uscita missione', e.message));
}

// Controllo periodico: pubblica le missioni la cui ora è arrivata. publish_at
// viene azzerato nella stessa UPDATE, quindi anche se due controlli si
// accavallassero l'annuncio parte una volta sola.
function publishDueMissions() {
  try {
    const now = Date.now();
    const due = db.prepare('SELECT * FROM missions WHERE archived = 1 AND publish_at IS NOT NULL').all()
      .filter((m) => romeStringToDate(m.publish_at).getTime() <= now);
    for (const m of due) {
      const info = db.prepare('UPDATE missions SET archived = 0, publish_at = NULL WHERE id = ? AND archived = 1').run(m.id);
      if (!info.changes) continue;           // qualcun altro l'ha già pubblicata
      auditSystem('missione.uscita', `«${m.title}» pubblicata all'orario programmato (${m.publish_at})`);
      announceMission(m);
    }
  } catch (e) { console.error('[MISSIONI] uscita programmata', e.message); }
}
const missionPublishTimer = setInterval(publishDueMissions, 20000);
missionPublishTimer.unref?.();   // non tiene vivo il processo allo spegnimento
publishDueMissions();            // recupera quelle scadute mentre il server era giù

// ── Promemoria "streak a rischio" ───────────────────────────────────────
// Una volta al giorno, verso le 20 (ora italiana), avvisa chi ha una striscia
// attiva ma non ha ancora ritirato il premio di oggi: a mezzanotte la perde.
// streak_last_day = ieri è la condizione giusta: implica sia "striscia viva"
// che "non ancora ritirato oggi" (altrimenti sarebbe già = oggi).
function remindStreakAtRisk() {
  try {
    const ora = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Rome', hour: '2-digit', hour12: false,
    }).format(new Date()));
    if (ora !== 20) return;   // finestra: solo durante le 20 (ora italiana)
    const oggi = todayStr();
    const ieri = romeDate(1);
    const rows = db.prepare(`
      SELECT id FROM users
      WHERE role = 'user' AND streak_day > 0 AND streak_last_day = ?
        AND (streak_reminded_day IS NULL OR streak_reminded_day <> ?)
    `).all(ieri, oggi);
    for (const u of rows) {
      db.prepare('UPDATE users SET streak_reminded_day = ? WHERE id = ?').run(oggi, u.id);
      pushToUser(u.id, {
        title: '🔥 La tua striscia rischia di spegnersi',
        body: 'Non hai ancora ritirato il premio di oggi: torna prima di mezzanotte per non perderla!',
        url: '/profilo',
      }).catch((e) => console.error('[PUSH] streak', e.message));
    }
  } catch (e) { console.error('[STREAK] promemoria', e.message); }
}
const streakReminderTimer = setInterval(remindStreakAtRisk, 20 * 60 * 1000);
streakReminderTimer.unref?.();
remindStreakAtRisk();

// ── Promemoria pronostici in scadenza ────────────────────────────────────
// Se l'admin ha impostato una chiusura (closes_at), un avviso parte UNA
// volta sola, circa 3 ore prima, a chi non ha ancora dato una risposta.
// reminder_sent impedisce il doppio invio qualunque sia la frequenza del
// controllo, purché resti sotto le 3 ore di margine.
const PRONOSTICO_PREAVVISO_MS = 3 * 60 * 60 * 1000;
function remindPredictionsClosing() {
  const now = Date.now();
  try {
    const pst = palioState();
    if (pst.open && pst.winner === null && pst.closes_at && !pst.reminder_sent) {
      const chiude = romeStringToDate(pst.closes_at).getTime();
      if (chiude > now && chiude - now <= PRONOSTICO_PREAVVISO_MS) {
        db.prepare('UPDATE palio_pronostico SET reminder_sent = 1 WHERE id = 1').run();
        const votanti = new Set(db.prepare('SELECT user_id FROM palio_predictions').all().map((r) => r.user_id));
        for (const u of db.prepare("SELECT id FROM users WHERE role = 'user'").all()) {
          if (votanti.has(u.id)) continue;
          pushToUser(u.id, {
            title: '⏳ Il pronostico del Palio sta per chiudere',
            body: 'Scegli il tuo fuochista prima che chiudano le votazioni!',
            url: '/palio#pronostico',
          }).catch((e) => console.error('[PUSH] pronostico palio in scadenza', e.message));
        }
      }
    }
  } catch (e) { console.error('[PRONOSTICI] promemoria palio', e.message); }

  try {
    const preds = db.prepare(`
      SELECT id, title FROM predictions
      WHERE open = 1 AND winner IS NULL AND archived = 0 AND closes_at IS NOT NULL AND reminder_sent = 0
    `).all();
    for (const pr of preds) {
      const chiude = romeStringToDate(pr.closes_at).getTime();
      if (!(chiude > now && chiude - now <= PRONOSTICO_PREAVVISO_MS)) continue;
      db.prepare('UPDATE predictions SET reminder_sent = 1 WHERE id = ?').run(pr.id);
      const votanti = new Set(db.prepare('SELECT user_id FROM prediction_votes WHERE prediction_id = ?').all(pr.id).map((r) => r.user_id));
      for (const u of db.prepare("SELECT id FROM users WHERE role = 'user'").all()) {
        if (votanti.has(u.id)) continue;
        pushToUser(u.id, {
          title: '⏳ Pronostico in scadenza',
          body: `«${pr.title}» sta per chiudere: dai la tua risposta!`,
          url: '/missioni',
        }).catch((e) => console.error('[PUSH] pronostico generico in scadenza', e.message));
      }
    }
  } catch (e) { console.error('[PRONOSTICI] promemoria generici', e.message); }
}
const predictionReminderTimer = setInterval(remindPredictionsClosing, 20 * 60 * 1000);
predictionReminderTimer.unref?.();
remindPredictionsClosing();

app.post('/admin/missioni', auth.requireStaff, (req, res) => {
  const b = req.body;
  const title = (b.title || '').trim();
  if (!title) { flash(req, 'error', 'Il titolo è obbligatorio.'); return res.redirect('/admin'); }
  // Con un'uscita programmata la missione nasce archiviata: resta nascosta
  // fino all'orario indicato, poi esce da sola.
  const publishAt = (b.publish_at || '').trim() || null;
  // Sezione: solo una delle quattro previste, altrimenti niente (sfida speciale)
  const section = SECTIONS.some((s) => s.key === b.section) ? b.section : null;
  db.prepare(`INSERT INTO missions
    (title, description, points, requires_photo, repeatable, active_from, active_to, archived, publish_at, section, sponsor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    title,
    (b.description || '').trim(),
    parseInt(b.points, 10) || 0,
    b.requires_photo ? 1 : 0,
    b.repeatable ? 1 : 0,
    (b.active_from || '').trim() || null,
    (b.active_to || '').trim() || null,
    (publishAt || b.archived) ? 1 : 0,
    publishAt,
    section,
    sponsorValido(b.sponsor),
  );
  // La spunta "avvisa tutti" suona il telefono a ogni iscritto: resta un
  // potere da admin. Un moderatore crea e corregge le missioni, ma non manda
  // notifiche di massa — e non basta togliere la casella dalla pagina, perché
  // il campo si può rimettere a mano nella richiesta.
  const puoAvvisare = req.currentUser.role === 'admin';
  if (b.notify && !publishAt && puoAvvisare) {
    pushBroadcast({ title: 'Nuova missione!', body: title, url: '/missioni' })
      .catch((e) => console.error('[PUSH] nuova missione', e.message));
  }
  audit(req, 'missione.crea', title + (publishAt ? ` (uscita programmata: ${publishAt})` : ''));
  flash(req, 'success', publishAt
    ? `Missione creata e programmata: esce il ${publishAt} e la notifica parte da sola.`
    : 'Missione creata.');
  res.redirect('/admin');
});

app.post('/admin/missioni/:id/modifica', auth.requireStaff, (req, res) => {
  const b = req.body;
  const prima = db.prepare('SELECT archived FROM missions WHERE id = ?').get(req.params.id);
  if (!prima) { flash(req, 'error', 'Missione inesistente.'); return res.redirect('/admin'); }

  const publishAt = (b.publish_at || '').trim() || null;
  // Se c'è un'uscita programmata la missione deve restare archiviata: sarebbe
  // assurdo "programmare" qualcosa che è già visibile.
  const archived = publishAt ? 1 : (b.archived ? 1 : 0);
  const section = SECTIONS.some((s) => s.key === b.section) ? b.section : null;
  db.prepare(`UPDATE missions SET
    title=?, description=?, points=?, requires_photo=?, repeatable=?, active_from=?, active_to=?, archived=?, publish_at=?, section=?, sponsor=?
    WHERE id=?`).run(
    (b.title || '').trim(),
    (b.description || '').trim(),
    parseInt(b.points, 10) || 0,
    b.requires_photo ? 1 : 0,
    b.repeatable ? 1 : 0,
    (b.active_from || '').trim() || null,
    (b.active_to || '').trim() || null,
    archived,
    publishAt,
    section,
    sponsorValido(b.sponsor),
    req.params.id,
  );
  audit(req, 'missione.modifica', `#${req.params.id} ${(b.title || '').trim()}`);

  // Archiviata → pubblica: è un'uscita a mano, annunciala come quelle programmate.
  // La spunta permette di NON avvisare (utile se stavi solo correggendo un errore).
  const uscitaOra = prima.archived === 1 && archived === 0;
  // Anche qui l'annuncio a tutti resta un potere da admin: un moderatore può
  // togliere una missione dall'archivio, ma senza suonare i telefoni.
  if (uscitaOra && b.notify && req.currentUser.role === 'admin') {
    const m = db.prepare('SELECT id, title, points FROM missions WHERE id = ?').get(req.params.id);
    auditSystem('missione.uscita', `«${m.title}» pubblicata a mano da ${req.currentUser.nickname}`);
    announceMission(m);
  }
  flash(req, 'success', uscitaOra
    ? (b.notify ? 'Missione pubblicata: notifica inviata a tutti.' : 'Missione pubblicata (senza notifica).')
    : (publishAt ? `Missione aggiornata: esce il ${publishAt}.` : 'Missione aggiornata.'));
  res.redirect('/admin');
});

app.post('/admin/missioni/:id/elimina', auth.requireStaff, (req, res) => {
  const m = db.prepare('SELECT title FROM missions WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM missions WHERE id = ?').run(req.params.id);
  // Si segna che è stata tolta a mano, se no patch_missioni.js la ricrea al
  // primo lancio: quello guarda l'elenco e rimette tutto ciò che manca, e
  // senza questa riga una missione cancellata apposta tornava da sola.
  if (m) {
    const nudo = String(m.title).replace(/^[^\p{L}\p{N}"'«(]+/u, '').trim();
    db.prepare('INSERT OR REPLACE INTO missioni_rimosse (nome, titolo) VALUES (?, ?)').run(nudo, m.title);
  }
  audit(req, 'missione.elimina', `#${req.params.id} ${m ? m.title : ''}`);
  flash(req, 'success', 'Missione eliminata.');
  res.redirect('/admin');
});

// Reset gioco: cancella tutto tranne gli admin
// Accende e spegne la settimana di sole iscrizioni (vedi lib/modalita.js).
// Una riga sola nel database: non tocca punti, iscritti ne' classifica, ed
// e' il motivo per cui riaprire non fa perdere niente a chi si e' iscritto
// prima. Niente notifica automatica: quando si riapre lo si annuncia da
// "Notifiche", scegliendo le parole, invece di far partire un messaggio
// scritto sei mesi fa.
app.post('/admin/iscrizioni', auth.requireAdmin, (req, res) => {
  const accendi = req.body.accendi === '1';
  modalita.imposta(accendi);
  audit(req, 'modalita.iscrizioni', accendi ? 'attivata' : 'spenta');
  flash(req, 'success', accendi
    ? 'Modalità sole iscrizioni ATTIVA: i giocatori vedono solo le pagine aperte.'
    : 'App aperta a tutti. I punti già fatti sono rimasti dov\'erano.');
  res.redirect('/admin');
});

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
  // Backup di sicurezza PRIMA di un'operazione distruttiva (best-effort, non blocca).
  runBackup('pre-reset');

  // Raccoglie i file su disco PRIMA di cancellare le righe (per rimuoverli dopo)
  const photoFiles  = db.prepare('SELECT photo_path FROM submissions WHERE photo_path IS NOT NULL').all().map((r) => r.photo_path);
  const storyFiles  = db.prepare('SELECT media_path FROM stories').all().map((r) => r.media_path);
  const avatarFiles = db.prepare("SELECT avatar_path FROM users WHERE role != 'admin' AND avatar_path IS NOT NULL").all().map((r) => r.avatar_path);

  db.transaction(() => {
    db.prepare('DELETE FROM submissions').run();                   // tutte le prove
    db.prepare('DELETE FROM stories').run();                       // tutte le storie (story_views a cascata)
    // Sgancia gli inviti dagli utenti (il vincolo è NO ACTION → altrimenti il DELETE
    // fallirebbe) e li rende di nuovo utilizzabili per la nuova registrazione.
    // Solo dove la tabella esiste ancora: vedi invitiCiSono().
    if (invitiCiSono()) {
      db.prepare('UPDATE invites SET used = 0, used_by_user_id = NULL, used_at = NULL').run();
      db.prepare("UPDATE invites SET created_by = NULL WHERE created_by IN (SELECT id FROM users WHERE role != 'admin')").run();
    }
    db.prepare("DELETE FROM users WHERE role != 'admin'").run();   // tutti gli utenti tranne gli admin
    // I codici premio (link/QR) restano, ma tornano TUTTI riscattabili: i QR
    // sono già stampati e appesi, buttarli via a ogni reset non avrebbe senso.
    db.prepare('UPDATE reward_codes SET claimed_by = NULL, claimed_at = NULL').run();
    // Storico delle partite: si azzera come tutto il resto. Gli utenti che le
    // hanno giocate spariscono qui sotto, quindi tenerlo lascerebbe righe che
    // puntano a nessuno — e la pagina statistiche direbbe "N partite" con
    // zero giocatori in elenco.
    db.prepare('DELETE FROM game_runs').run();
    // Missioni di carriera del Jetpack. Per gli utenti cancellati sparirebbero
    // da sole (ON DELETE CASCADE), ma gli admin restano: senza questo si
    // ritroverebbero zero stelle e tre missioni già a metà, e le chiuderebbero
    // al primo volo riprendendosi subito i gradi.
    db.prepare('DELETE FROM jetpack_missions').run();
    // Classifica pulita: azzera anche le statistiche di gioco degli admin
    // rimasti. Le tre colonne jp_* sono arrivate dopo ed erano rimaste fuori:
    // un admin si teneva record e stelle, e con le stelle già in tasca si
    // riprendeva i gradi (e i punti) al primo volo.
    db.prepare(`UPDATE users SET points_adjust = 0, game_best = 0, game_plays = 0,
                jp_best = 0, jp_plays = 0, jp_stars = 0,
                streak_day = 0, streak_last_day = NULL, last_wheel_day = NULL`).run();
    // Registro dei movimenti e bonus di sezione: stessa storia del Jetpack qui
    // sopra. Per gli utenti cancellati spariscono da soli (ON DELETE CASCADE),
    // ma gli ADMIN restano — e l'UPDATE qui sopra gli azzera il saldo senza
    // togliere le righe. Risultato: uno storico che elenca movimenti per punti
    // che non ci sono piu', un "non spiegato" negativo grosso quanto il vecchio
    // saldo, e sezioni gia' segnate come completate che non danno piu' il bonus
    // la seconda volta. Il registro deve dire la verita' sul saldo: se il saldo
    // riparte da zero, riparte da zero anche lui.
    db.prepare('DELETE FROM punti_movimenti').run();
    db.prepare('DELETE FROM section_bonuses').run();
  })();

  // Rimuove i file orfani dal disco (best-effort, non blocca la risposta)
  const rmFiles = (dir, names) => names.forEach((n) => { if (n) fs.unlink(path.join(dir, path.basename(n)), () => {}); });
  rmFiles(UPLOADS_DIR, photoFiles);
  rmFiles(STORIES_DIR, storyFiles);
  rmFiles(AVATARS_DIR, avatarFiles);

  audit(req, 'reset.gioco', `${photoFiles.length} prove, ${storyFiles.length} storie eliminate`);
  flash(req, 'success', 'Reset completato: utenti, prove, storie, classifica e registro punti azzerati. Missioni e codici premio mantenuti.');
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
  audit(req, 'utente.ruolo', `${target.nickname} -> ${role}`);
  flash(req, 'success', `Ruolo di ${target.nickname} aggiornato a ${role}.`);
  res.redirect('/admin');
});

// Cancellazione di un account da parte dell'admin. È irreversibile e porta via
// anche foto, storie e avatar della persona, quindi:
//  · serve la password dell'admin (una form inviata per sbaglio non basta)
//  · non ci si può cancellare da soli da qui (si usa il proprio profilo)
//  · non si può cancellare un altro admin: prima va retrocesso, così serve un
//    passaggio in più e non si perde per sbaglio l'ultimo accesso al pannello
app.post('/admin/utenti/:id/elimina', auth.requireAdmin, (req, res) => {
  const target = auth.getUserById(req.params.id);
  if (!target) { flash(req, 'error', 'Utente inesistente.'); return res.redirect('/admin'); }
  if (target.id === req.currentUser.id) {
    flash(req, 'error', 'Non puoi cancellare il tuo account da qui: usa il tuo profilo.');
    return res.redirect('/admin');
  }
  if (target.role === 'admin') {
    flash(req, 'error', `${target.nickname} è admin: portalo prima a "user", poi potrai eliminarlo.`);
    return res.redirect('/admin');
  }
  if (!auth.verifyPassword(req.body.admin_password || '', req.currentUser.password_hash)) {
    flash(req, 'error', 'Password admin errata: nessun account eliminato.');
    return res.redirect('/admin');
  }
  const nickname = target.nickname;
  // La spunta va letta PRIMA della cancellazione: dopo, l'email non c'e' piu'
  // da nessuna parte. Non e' spuntata di default — bloccare e' una decisione,
  // e la cancellazione piu' comune (un utente che lo chiede) non la vuole.
  const daBloccare = !!req.body.blocca_email && !!target.email;
  const removed = purgeUser(target);
  if (daBloccare) {
    bloccoEmail.blocca(target.email, {
      nickname, motivo: 'Account eliminato dallo staff', da: req.currentUser.nickname,
    });
    audit(req, 'email.blocca', `${nickname} (#${target.id}) · ${bloccoEmail.maschera(target.email)}`);
  }
  // Lo storno dell'invito va detto: e' il senso di ripulire i finti account,
  // e chi cancella deve vedere che i punti sono tornati indietro davvero.
  const storno = removed.puntiStornati
    ? ` · ${removed.puntiStornati}pt tolti a chi l'aveva invitato` : '';
  audit(req, 'utente.elimina', `${nickname} (#${target.id}) · ${removed.foto} foto, ${removed.storie} storie${storno}`);
  flash(req, 'success', `Account di ${nickname} eliminato, insieme a ${removed.foto} foto e ${removed.storie} storie.`
    + (removed.puntiStornati ? ` Tolti ${removed.puntiStornati} punti a chi l'aveva invitato.` : '')
    + (daBloccare ? ' La sua email non potrà più iscriversi.' : ''));
  res.redirect('/admin');
});

// Sblocca un'email: senza questa, una spunta messa per sbaglio sarebbe
// definitiva e l'unico rimedio sarebbe mettere le mani nel database.
app.post('/admin/email-bloccate/:id/sblocca', auth.requireAdmin, (req, res) => {
  const riga = db.prepare('SELECT mascherata FROM email_bloccate WHERE id = ?').get(req.params.id);
  if (!riga) { flash(req, 'error', 'Blocco inesistente.'); return res.redirect('/admin'); }
  bloccoEmail.sblocca(req.params.id);
  audit(req, 'email.sblocca', riga.mascherata);
  flash(req, 'success', `${riga.mascherata} può iscriversi di nuovo.`);
  res.redirect('/admin');
});

// Assegna (o corregge) punti bonus a un utente — es. vincitore del contest Instagram.
// I punti entrano in points_adjust: stessa valuta di classifica, gioco, ruota e slot.
app.post('/admin/utenti/:id/bonus', auth.requireAdmin, (req, res) => {
  const target = auth.getUserById(req.params.id);
  if (!target) { flash(req, 'error', 'Utente inesistente.'); return res.redirect('/admin'); }
  // Il segno lo decide il PULSANTE, non quello che si scrive nel campo: si
  // digita sempre un numero positivo e si sceglie "Dai" o "Togli". Il valore
  // assoluto serve proprio a questo — chi scrive "-500" e preme "Dai" voleva
  // dare 500, non toglierne altri 500.
  // Senza `verso` (una pagina vecchia rimasta aperta) vale il segno scritto,
  // che era il comportamento di prima: cosi' non si rompe a meta' festa.
  const grezzi = parseInt(req.body.points, 10);
  const verso = req.body.verso === '-1' ? -1 : (req.body.verso === '1' ? 1 : 0);
  const pts = verso === 0 ? grezzi : Math.abs(grezzi) * verso;
  if (!Number.isFinite(pts) || pts === 0) { flash(req, 'error', 'Inserisci un numero di punti valido (diverso da 0).'); return res.redirect('/admin'); }
  const reason = (req.body.reason || '').trim().slice(0, 120);
  punti.muovi(target.id, pts, 'admin', `${req.currentUser.nickname}` + (reason ? ': ' + reason : ''));
  audit(req, 'utente.bonus', `${target.nickname}: ${pts > 0 ? '+' : ''}${pts}pt${reason ? ' (' + reason + ')' : ''}`);
  const segno = pts > 0 ? '+' : '';
  // Notifica push all'utente interessato (solo se ha le notifiche attive)
  pushToUser(target.id, {
    title: pts > 0 ? '🎉 Punti bonus!' : 'Punti aggiornati',
    body: `${segno}${pts} punti${reason ? ' · ' + reason : ''}`,
    url: '/profilo',
  }).catch((e) => console.error('[PUSH] bonus', e.message));
  if (pts > 0) checkLevelUp(target.id);
  flash(req, 'success', `${segno}${pts} punti a ${target.nickname}${reason ? ' (' + reason + ')' : ''}. Totale ora: ${userPoints(target.id)}.`);
  res.redirect('/admin');
});

// ── Pronostico Palio dei Fuochi (admin) ────────────────────────────────────
// Apre/chiude i pronostici e imposta i punti in palio.
app.post('/admin/pronostico/impostazioni', auth.requireAdmin, (req, res) => {
  const st = palioState();
  if (st.winner !== null) { flash(req, 'error', 'Pronostico già chiuso: annullalo prima di modificarlo.'); return res.redirect('/admin'); }
  const open = req.body.open === '1' ? 1 : 0;
  let points = parseInt(req.body.points, 10);
  if (!Number.isFinite(points) || points < 0) points = st.points;
  const closesAt = (req.body.closes_at || '').trim() || null;
  // Se la chiusura cambia, il promemoria (se già partito) può ripartire.
  const reminderSent = (closesAt === st.closes_at) ? (st.reminder_sent ? 1 : 0) : 0;
  db.prepare('UPDATE palio_pronostico SET open = ?, points = ?, closes_at = ?, reminder_sent = ? WHERE id = 1')
    .run(open, points, closesAt, reminderSent);
  audit(req, 'pronostico.impostazioni', `open=${open} punti=${points}${closesAt ? ` chiude=${closesAt}` : ''}`);
  flash(req, 'success', `Pronostico ${open ? 'aperto' : 'chiuso'} · ${points} punti in palio${closesAt ? ` · chiude il ${closesAt}` : ''}.`);
  res.redirect('/admin');
});

// Dichiara il vincitore e accredita i punti a chi ha indovinato (idempotente:
// storna eventuali accrediti precedenti prima di riassegnare, così si può correggere).
app.post('/admin/pronostico/vincitore', auth.requireAdmin, (req, res) => {
  const winner = parseInt(req.body.winner, 10);
  if (!Number.isInteger(winner) || winner < 0 || winner >= PALIO_FUOCHISTI.length) {
    flash(req, 'error', 'Seleziona un fuochista vincitore valido.'); return res.redirect('/admin');
  }
  const st = palioState();
  const points = st.points;
  const winners = db.transaction(() => {
    // Storna accrediti precedenti (in caso di ri-dichiarazione)
    for (const p of db.prepare('SELECT user_id, awarded_points FROM palio_predictions WHERE awarded_points <> 0').all()) {
      punti.muovi(p.user_id, -p.awarded_points, 'storno', 'Palio ridichiarato');
    }
    db.prepare('UPDATE palio_predictions SET awarded_points = 0 WHERE awarded_points <> 0').run();
    // Accredita ai vincitori
    const win = db.prepare('SELECT user_id FROM palio_predictions WHERE choice = ?').all(winner);
    if (points > 0) {
      for (const p of win) {
        punti.muovi(p.user_id, points, 'palio', PALIO_FUOCHISTI[winner].name);
      }
      db.prepare('UPDATE palio_predictions SET awarded_points = ? WHERE choice = ?').run(points, winner);
    }
    db.prepare("UPDATE palio_pronostico SET winner = ?, open = 0, resolved_at = datetime('now') WHERE id = 1").run(winner);
    return win.map((p) => p.user_id);
  })();
  audit(req, 'pronostico.vincitore', `${PALIO_FUOCHISTI[winner].name} · ${winners.length} vincitori · ${points}pt`);
  // Notifica push ai vincitori
  for (const uid of winners) {
    pushToUser(uid, {
      title: '🎆 Hai vinto il pronostico!',
      body: `${PALIO_FUOCHISTI[winner].name} ha vinto il Palio: +${points} punti!`,
      url: '/classifica',
    }).catch((e) => console.error('[PUSH] pronostico', e.message));
    checkLevelUp(uid);
  }
  flash(req, 'success', `Vincitore: ${PALIO_FUOCHISTI[winner].name}. Accreditati ${points} punti a ${winners.length} utenti.`);
  res.redirect('/admin');
});

// Annulla il pronostico: storna i punti e riapre le votazioni.
app.post('/admin/pronostico/reset', auth.requireAdmin, (req, res) => {
  db.transaction(() => {
    for (const p of db.prepare('SELECT user_id, awarded_points FROM palio_predictions WHERE awarded_points <> 0').all()) {
      punti.muovi(p.user_id, -p.awarded_points, 'storno', 'Palio ridichiarato');
    }
    db.prepare('UPDATE palio_predictions SET awarded_points = 0 WHERE awarded_points <> 0').run();
    db.prepare("UPDATE palio_pronostico SET winner = NULL, open = 1, resolved_at = NULL WHERE id = 1").run();
  })();
  audit(req, 'pronostico.reset', 'punti stornati, votazioni riaperte');
  flash(req, 'success', 'Pronostico annullato: punti stornati e votazioni riaperte.');
  res.redirect('/admin');
});

// ── Pronostici generici (admin): crea / imposta / vincitore / annulla / elimina ──
app.post('/admin/pronostici', auth.requireAdmin, (req, res) => {
  const title = (req.body.title || '').trim().slice(0, 140);
  const description = (req.body.description || '').trim().slice(0, 400);
  const opts = (req.body.options || '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 20);
  let points = parseInt(req.body.points, 10); if (!Number.isFinite(points) || points < 0) points = 100;
  const multi = req.body.multi ? 1 : 0;
  const closesAt = (req.body.closes_at || '').trim() || null;
  if (!title) { flash(req, 'error', 'Scrivi la domanda del pronostico.'); return res.redirect('/admin'); }
  if (opts.length < 2) { flash(req, 'error', 'Servono almeno 2 opzioni (una per riga).'); return res.redirect('/admin'); }
  db.prepare('INSERT INTO predictions (title, description, options, points, multi, closes_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(title, description, JSON.stringify(opts), points, multi, closesAt);
  audit(req, 'pronostico.crea', `${title} (${opts.length} opzioni, ${points}pt${multi ? ', multi' : ''}${closesAt ? `, chiude ${closesAt}` : ''})`);
  flash(req, 'success', `Pronostico creato: «${title}».`);
  res.redirect('/admin');
});

app.post('/admin/pronostici/:id/impostazioni', auth.requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM predictions WHERE id = ?').get(req.params.id);
  if (!p) { flash(req, 'error', 'Pronostico inesistente.'); return res.redirect('/admin'); }
  if (p.winner !== null) { flash(req, 'error', 'Pronostico già chiuso: annullalo prima di modificarlo.'); return res.redirect('/admin'); }
  const open = req.body.open === '1' ? 1 : 0;
  let points = parseInt(req.body.points, 10); if (!Number.isFinite(points) || points < 0) points = p.points;
  const closesAt = (req.body.closes_at || '').trim() || null;
  const reminderSent = (closesAt === p.closes_at) ? (p.reminder_sent ? 1 : 0) : 0;
  db.prepare('UPDATE predictions SET open = ?, points = ?, closes_at = ?, reminder_sent = ? WHERE id = ?')
    .run(open, points, closesAt, reminderSent, p.id);
  audit(req, 'pronostico.impostazioni', `#${p.id} open=${open} punti=${points}${closesAt ? ` chiude=${closesAt}` : ''}`);
  flash(req, 'success', `«${p.title}»: ${open ? 'aperto' : 'chiuso'} · ${points} punti${closesAt ? ` · chiude il ${closesAt}` : ''}.`);
  res.redirect('/admin');
});

// Pubblica o rimette in cantiere un pronostico. `archived` e' la leva che
// decide se i giocatori lo vedono; `open` decide se possono ancora votare.
// Sono due cose diverse: un pronostico puo' essere in vista ma gia' chiuso.
//
// La notifica a tutti NON parte da sola: e' una spunta, e la spunta si puo'
// togliere. Pubblicare di notte suonando il telefono a tutto il paese e' un
// modo sicuro di farsi odiare, e capita di dover pubblicare in anticipo per
// controllare che si veda bene.
app.post('/admin/pronostici/:id/pubblica', auth.requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM predictions WHERE id = ?').get(req.params.id);
  if (!p) { flash(req, 'error', 'Pronostico inesistente.'); return res.redirect('/admin'); }

  const pubblica = req.body.pubblica === '1';
  const archived = pubblica ? 0 : 1;
  if (p.archived === archived) {
    flash(req, 'error', `«${p.title}» era gia' ${pubblica ? 'pubblicato' : 'in cantiere'}.`);
    return res.redirect('/admin');
  }
  db.prepare('UPDATE predictions SET archived = ? WHERE id = ?').run(archived, p.id);
  audit(req, 'pronostico.pubblica', `#${p.id} «${p.title}» → ${pubblica ? 'pubblicato' : 'in cantiere'}`);

  // Si avvisa solo quando ESCE, e solo se la spunta e' rimasta accesa.
  const avvisa = pubblica && req.body.notify === '1';
  if (avvisa) {
    pushBroadcast({
      title: '🎯 Nuovo pronostico!',
      body: p.title,
      url: '/missioni',
    }).catch((e) => console.error('[PUSH] pronostico pubblicato', e.message));
    auditSystem('pronostico.annuncio', `«${p.title}» annunciato a tutti da ${req.currentUser.nickname}`);
  }

  flash(req, 'success', pubblica
    ? (avvisa ? `«${p.title}» pubblicato: notifica inviata a tutti.` : `«${p.title}» pubblicato, senza notifica.`)
    : `«${p.title}» rimesso in cantiere: i giocatori non lo vedono piu'.`);
  res.redirect('/admin');
});

app.post('/admin/pronostici/:id/vincitore', auth.requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM predictions WHERE id = ?').get(req.params.id);
  if (!p) { flash(req, 'error', 'Pronostico inesistente.'); return res.redirect('/admin'); }
  const opts = predOptions(p);
  const winner = parseInt(req.body.winner, 10);
  if (!Number.isInteger(winner) || winner < 0 || winner >= opts.length) {
    flash(req, 'error', 'Seleziona un\'opzione vincente valida.'); return res.redirect('/admin');
  }
  const winners = predictionAward(p, winner);
  db.prepare("UPDATE predictions SET winner = ?, open = 0, resolved_at = datetime('now') WHERE id = ?").run(winner, p.id);
  audit(req, 'pronostico.vincitore', `#${p.id} «${opts[winner]}» · ${winners.length} vincitori · ${p.points}pt`);
  for (const uid of winners) {
    pushToUser(uid, {
      title: '🎯 Hai vinto il pronostico!',
      body: `«${p.title}» → ${opts[winner]}: +${p.points} punti!`,
      url: '/classifica',
    }).catch((e) => console.error('[PUSH] pronostico generico', e.message));
    checkLevelUp(uid);
  }
  flash(req, 'success', `Vincitore: ${opts[winner]}. Accreditati ${p.points} punti a ${winners.length} utenti.`);
  res.redirect('/admin');
});

app.post('/admin/pronostici/:id/reset', auth.requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM predictions WHERE id = ?').get(req.params.id);
  if (!p) { flash(req, 'error', 'Pronostico inesistente.'); return res.redirect('/admin'); }
  predictionAward(p, null);   // storna soltanto
  db.prepare("UPDATE predictions SET winner = NULL, open = 1, resolved_at = NULL WHERE id = ?").run(p.id);
  audit(req, 'pronostico.reset', `#${p.id} annullato`);
  flash(req, 'success', 'Pronostico annullato: punti stornati e votazioni riaperte.');
  res.redirect('/admin');
});

app.post('/admin/pronostici/:id/elimina', auth.requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM predictions WHERE id = ?').get(req.params.id);
  if (!p) { flash(req, 'error', 'Pronostico inesistente.'); return res.redirect('/admin'); }
  predictionAward(p, null);   // storna eventuali punti assegnati prima di eliminare
  db.prepare('DELETE FROM predictions WHERE id = ?').run(p.id);   // i voti vanno a cascata
  audit(req, 'pronostico.elimina', `#${p.id} «${p.title}»`);
  flash(req, 'success', `Pronostico «${p.title}» eliminato.`);
  res.redirect('/admin');
});

// ── Backup: esegui ora / scarica uno snapshot ──────────────────────────────
app.post('/admin/backup', auth.requireAdmin, async (req, res) => {
  const file = await runBackup('manuale');
  audit(req, 'backup.manuale', file || 'fallito');
  flash(req, file ? 'success' : 'error', file ? `Backup creato: ${file}` : 'Backup fallito: controlla i log del server.');
  res.redirect('/admin');
});

app.get('/admin/backup/:name', auth.requireAdmin, (req, res) => {
  // Whitelist stretta: solo nomi generati da runBackup, niente attraversamento di percorso
  const name = req.params.name;
  if (!/^backup-[A-Za-z0-9_.-]+\.db$/.test(name)) return res.status(400).send('Nome non valido.');
  const full = path.join(BACKUPS_DIR, name);
  if (!fs.existsSync(full)) return res.status(404).send('Backup non trovato.');
  audit(req, 'backup.scarica', name);
  res.download(full, name);
});

// ── Segnalazioni storie: ignora (le storie si eliminano dal pulsante esistente) ──
app.post('/admin/segnalazioni/:storyId/ignora', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.storyId);
  db.prepare('DELETE FROM story_reports WHERE story_id = ?').run(id);
  db.prepare('UPDATE stories SET hidden = 0 WHERE id = ?').run(id);
  audit(req, 'segnalazione.ignora', `storia #${id}`);
  flash(req, 'success', 'Segnalazioni ignorate: la storia torna visibile.');
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

// Riporta i bonus invito già pagati sotto la regola dei 350 punti: chi ha
// incassato per un amico che non ci è arrivato se li vede togliere, con un
// avviso. Gira UNA volta sola — l'interruttore sta nel database, non in una
// variabile, o a ogni riavvio del container ripartirebbe e le notifiche
// arriverebbero di nuovo (senza togliere altri punti, ma sarebbe comunque
// una brutta figura).
//
// Sta all'avvio e non in db.js perché manda notifiche, e db.js è lo strato
// più in basso: non deve sapere che esistono le push.
function allineaInvitiUnaVolta() {
  const CHIAVE = 'inviti_allineati_a_soglia';
  const fatto = db.prepare('SELECT valore FROM impostazioni WHERE chiave = ?').get(CHIAVE);
  if (fatto) return;
  try {
    const tolti = inviti.allineaAllaSoglia();
    db.prepare("INSERT INTO impostazioni (chiave, valore) VALUES (?, datetime('now'))").run(CHIAVE);
    if (!tolti.length) { console.log('[INVITI] nessun bonus da riportare alla soglia.'); return; }
    const somma = tolti.reduce((a, x) => a + x.punti, 0);
    console.log(`[INVITI] tolti ${somma} punti a ${tolti.length} persone: amici sotto i ${inviti.SOGLIA_INVITO} punti.`);
    tolti.forEach((x) => inviti.avvisaAllineamento(x));
  } catch (e) {
    // Un errore qui non deve impedire all'app di partire: senza l'interruttore
    // scritto, il prossimo avvio riprova.
    console.error('[INVITI] allineamento alla soglia fallito:', e.message);
  }
}

// Rimpicciolisce gli avatar già caricati, che sono ancora quelli pieni usciti
// dal telefono. Gira una volta sola: l'interruttore sta nel database.
//
// Uno alla volta e con un respiro fra uno e l'altro: jimp decodifica in
// memoria un'immagine da 4000px per volta, e farne cento tutte insieme
// all'avvio metterebbe in ginocchio il server proprio mentre la gente entra.
// Nessuna fretta — è roba che si fa una volta nella vita dell'app.
async function rimpiccioliscAvatarUnaVolta() {
  const CHIAVE = 'avatar_rimpiccioliti';
  if (db.prepare('SELECT 1 FROM impostazioni WHERE chiave = ?').get(CHIAVE)) return;
  try {
    const righe = db.prepare("SELECT id, avatar_path FROM users WHERE avatar_path IS NOT NULL AND avatar_path <> ''").all();
    let fatti = 0, risparmio = 0;
    for (const u of righe) {
      const nome = path.basename(u.avatar_path);
      if (!fs.existsSync(path.join(AVATARS_DIR, nome))) continue;
      const rid = await ridimensiona(AVATARS_DIR, nome, FOTO_AVATAR);
      if (!rid) continue;                       // già piccolo, o formato indigesto
      if (rid.nomeFile !== nome) {
        db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(rid.nomeFile, u.id);
      }
      fatti++; risparmio += rid.prima - rid.dopo;
      await new Promise((r) => setTimeout(r, 50));
    }
    db.prepare("INSERT INTO impostazioni (chiave, valore) VALUES (?, datetime('now'))").run(CHIAVE);
    console.log(fatti
      ? `[AVATAR] rimpiccioliti ${fatti} avatar su ${righe.length}: ${(risparmio / 1024 / 1024).toFixed(1)} MB in meno.`
      : '[AVATAR] nessun avatar da rimpicciolire.');
  } catch (e) {
    // Senza interruttore scritto, il prossimo avvio riprova. E comunque un
    // avatar grande non impedisce a nessuno di giocare.
    console.error('[AVATAR] rimpicciolimento fallito:', e.message);
  }
}

app.listen(PORT, () => {
  console.log(`\n🎉 FantaSanRocco è attivo — accessibile via Cloudflare Tunnel.`);
  console.log(`   Dati salvati in: ${DATA_DIR}\n`);
  allineaInvitiUnaVolta();
  rimpiccioliscAvatarUnaVolta();
});
