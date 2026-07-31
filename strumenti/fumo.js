#!/usr/bin/env node
// ===================================================================
// FantaSanRocco — prova del fumo ("smoke test")
// -------------------------------------------------------------------
// Non è una suite di test: è la rete minima sotto al trapezio. Avvia il
// server su una COPIA del database, apre tutte le pagine come anonimo,
// come utente e come admin, e dice quali rispondono male.
//
// Serve perché il progetto non ha test automatici: prima di ogni
// spostamento di file si lancia questo, si sposta, si rilancia. Se il
// numero di pagine a posto cambia, l'ultimo spostamento ha rotto qualcosa
// e lo si sa subito invece che dagli utenti.
//
// Uso:  node strumenti/fumo.js
// Esce con codice 1 se qualcosa non va, così si può usare in automatico.
// ===================================================================
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RADICE = path.join(__dirname, '..');
const PORTA = 3999;
const BASE = `http://127.0.0.1:${PORTA}`;
const PASSWORD = 'fumo-prova-1234';

// Pagine da controllare. `chi` dice con quale sessione aprirle, `attesa` il
// codice HTTP che ci si aspetta: una redirect al login È la risposta giusta
// per una pagina riservata aperta da un anonimo, non un errore.
const PAGINE = [
  { via: '/',                    chi: 'anonimo', attesa: 200 },
  { via: '/premio',              chi: 'anonimo', attesa: 200 },
  { via: '/classifica',          chi: 'anonimo', attesa: 200 },
  { via: '/programmazione',      chi: 'anonimo', attesa: 200 },
  { via: '/galleria',            chi: 'anonimo', attesa: 200 },
  { via: '/palio',               chi: 'anonimo', attesa: 200 },
  { via: '/storia',              chi: 'anonimo', attesa: 200 },
  { via: '/giochi',              chi: 'anonimo', attesa: 200 },
  { via: '/giochi?g=jetpack',    chi: 'anonimo', attesa: 200 },
  { via: '/giochi?g=slot',       chi: 'anonimo', attesa: 200 },
  { via: '/privacy',             chi: 'anonimo', attesa: 200 },
  { via: '/termini',             chi: 'anonimo', attesa: 200 },
  { via: '/login',               chi: 'anonimo', attesa: 200 },
  { via: '/registrati',          chi: 'anonimo', attesa: 200 },
  { via: '/password-dimenticata',chi: 'anonimo', attesa: 200 },
  { via: '/health',              chi: 'anonimo', attesa: 200 },
  { via: '/api/radio/now',       chi: 'anonimo', attesa: 200 },
  { via: '/api/online',          chi: 'anonimo', attesa: 200 },
  { via: '/missioni',            chi: 'anonimo', attesa: 302 },   // riservata: rimanda al login
  { via: '/profilo',             chi: 'anonimo', attesa: 302 },
  { via: '/admin',               chi: 'anonimo', attesa: 403 },
  { via: '/admin/statistiche',   chi: 'anonimo', attesa: 403 },

  { via: '/missioni',            chi: 'utente',  attesa: 200 },
  { via: '/profilo',             chi: 'utente',  attesa: 200 },
  { via: '/ruota',               chi: 'utente',  attesa: 200 },
  // /slot e /gioco sono vecchi indirizzi tenuti vivi: rimandano alla pagina
  // unica dei giochi con un 301, ed è giusto che rispondano così.
  { via: '/slot',                chi: 'utente',  attesa: 301 },
  { via: '/gioco',               chi: 'utente',  attesa: 301 },
  { via: '/classifica',          chi: 'utente',  attesa: 200 },
  { via: '/admin',               chi: 'utente',  attesa: 403 },   // non è admin

  { via: '/admin',                       chi: 'admin', attesa: 200 },
  { via: '/admin/statistiche',           chi: 'admin', attesa: 200 },
  { via: '/admin/statistiche?range=1',   chi: 'admin', attesa: 200 },
  { via: '/admin/statistiche?range=all', chi: 'admin', attesa: 200 },
  { via: '/admin/prove.csv',             chi: 'admin', attesa: 200 },
  { via: '/moderazione',                 chi: 'admin', attesa: 200 },
  { via: '/2fa',                         chi: 'admin', attesa: 200 },
];

// Frammenti che DEVONO comparire: se una pagina risponde 200 ma vuota, il
// codice HTTP da solo non se ne accorge.
const CONTENUTI = [
  { via: '/premio',     chi: 'anonimo', cerca: 'Box viaggi',        cosa: 'primo premio' },
  { via: '/classifica', chi: 'anonimo', cerca: 'lb-podium',         cosa: 'podio' },
  { via: '/',           chi: 'anonimo', cerca: 'premi in palio',    cosa: 'striscia numeri' },
  { via: '/giochi',     chi: 'anonimo', cerca: 'jetpack.js',        cosa: 'script del gioco' },
  { via: '/premio',     chi: 'anonimo', cerca: 'spon-track',        cosa: 'barra sponsor' },
];

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

// Sessione minimale: tiene i cookie e sa fare il login col CSRF.
function creaSessione() {
  let cookie = '';
  const assorbi = (res) => {
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of set) {
      const [kv] = c.split(';');
      const nome = kv.split('=')[0];
      const resto = cookie.split('; ').filter((x) => x && x.split('=')[0] !== nome);
      cookie = [...resto, kv].join('; ');
    }
  };
  return {
    async get(via) {
      const res = await fetch(BASE + via, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
      assorbi(res);
      return res;
    },
    async login(nickname) {
      const pag = await this.get('/login');
      const html = await pag.text();
      const tok = (html.match(/name="_csrf" value="([^"]+)"/) || [])[1] || '';
      const res = await fetch(BASE + '/login', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ nickname, password: PASSWORD, _csrf: tok }),
        redirect: 'manual',
      });
      assorbi(res);
      return res.status === 302;
    },
  };
}

(async () => {
  // 1. copia del database, mai quello vero
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'fsr-fumo-'));
  const vero = path.join(RADICE, 'data', 'fantasanrocco.db');
  if (fs.existsSync(vero)) fs.copyFileSync(vero, path.join(cartella, 'fantasanrocco.db'));
  fs.mkdirSync(path.join(cartella, 'uploads'), { recursive: true });

  // 2. server sulla copia. SECURE_COOKIES spento: in locale si va in http e
  //    il cookie di sessione con `secure` non verrebbe mai rimandato indietro.
  const srv = spawn(process.execPath, [path.join(RADICE, 'src', 'server.js')], {
    cwd: RADICE,
    env: { ...process.env, DATA_DIR: cartella, PORT: String(PORTA), SECURE_COOKIES: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logServer = '';
  srv.stdout.on('data', (d) => { logServer += d; });
  srv.stderr.on('data', (d) => { logServer += d; });

  const chiudi = (codice) => {
    try { srv.kill('SIGTERM'); } catch {}
    fs.rmSync(cartella, { recursive: true, force: true });
    process.exit(codice);
  };
  srv.on('exit', (c) => {
    if (c !== 0 && c !== null) {
      console.error('Il server è morto durante l\'avvio:\n' + logServer);
      fs.rmSync(cartella, { recursive: true, force: true });
      process.exit(1);
    }
  });

  // 3. aspetta che risponda
  let su = false;
  for (let i = 0; i < 60 && !su; i++) {
    try { await fetch(BASE + '/health'); su = true; } catch { await attesa(250); }
  }
  if (!su) { console.error('Il server non ha risposto entro 15 secondi:\n' + logServer); chiudi(1); }

  // 4. due utenti di prova nella copia
  const Database = require(path.join(RADICE, 'node_modules', 'better-sqlite3'));
  const bcrypt = require(path.join(RADICE, 'node_modules', 'bcryptjs'));
  const db = new Database(path.join(cartella, 'fantasanrocco.db'));
  const h = bcrypt.hashSync(PASSWORD, 10);
  const crea = (nick, ruolo) => {
    db.prepare('DELETE FROM users WHERE nickname = ?').run(nick);
    db.prepare(`INSERT INTO users (nickname, email, password_hash, role, created_at, totp_enabled, privacy_accepted_at)
                VALUES (?, ?, ?, ?, datetime('now'), 0, datetime('now'))`)
      .run(nick, nick + '@fumo.local', h, ruolo);
  };
  crea('fumo_utente', 'user');
  crea('fumo_admin', 'admin');
  db.close();

  // 5. sessioni
  const sessioni = { anonimo: creaSessione(), utente: creaSessione(), admin: creaSessione() };
  const okU = await sessioni.utente.login('fumo_utente');
  const okA = await sessioni.admin.login('fumo_admin');
  if (!okU || !okA) { console.error('Login di prova fallito (utente=' + okU + ' admin=' + okA + ')'); chiudi(1); }

  // 6. giro delle pagine
  let guasti = 0;
  console.log('\nPAGINE');
  for (const p of PAGINE) {
    let esito, stato;
    try { const r = await sessioni[p.chi].get(p.via); stato = r.status; }
    catch (e) { stato = 'ERRORE ' + e.message; }
    esito = stato === p.attesa;
    if (!esito) guasti++;
    console.log(`  ${esito ? '·' : '✗'} ${String(stato).padEnd(5)} atteso ${String(p.attesa).padEnd(4)} ${p.chi.padEnd(8)} ${p.via}`);
  }

  console.log('\nCONTENUTI');
  for (const c of CONTENUTI) {
    let dentro = false;
    try { dentro = (await (await sessioni[c.chi].get(c.via)).text()).includes(c.cerca); } catch {}
    if (!dentro) guasti++;
    console.log(`  ${dentro ? '·' : '✗'} ${c.cosa.padEnd(18)} in ${c.via}`);
  }

  const errori = (logServer.match(/^\s*(Error|TypeError|ReferenceError)/gm) || []).length;
  if (errori) { guasti += errori; console.log(`\n✗ ${errori} errori nel log del server`); }

  console.log(`\n${guasti === 0 ? '✓ tutto a posto' : '✗ ' + guasti + ' problemi'} — ${PAGINE.length} pagine + ${CONTENUTI.length} contenuti`);
  chiudi(guasti === 0 ? 0 : 1);
})();
