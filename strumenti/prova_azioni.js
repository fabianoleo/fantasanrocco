#!/usr/bin/env node
// ===================================================================
// FantaSanRocco — prova delle AZIONI
// -------------------------------------------------------------------
// La prova del fumo apre le pagine. Questa fa le cose: gioca una
// partita vera col cronometro, gira la ruota, punta alla slot, manda
// una prova con la foto, la approva da moderatore.
//
// Non guarda il codice HTTP: guarda il RISULTATO. Che i punti arrivati
// siano quelli giusti, che il record si sia alzato, che il duplicato
// venga riconosciuto. Un 200 su un'azione che non ha fatto niente e'
// il tipo di guasto che questa prova esiste per prendere.
//
// L'anti-cheat e' la parte che conta di piu': e' gia' stato tarato
// male due volte, tagliando i punti a chi giocava onesto, e finora non
// c'era niente che se ne accorgesse prima delle lamentele. Qui si
// prova la partita onesta E i tre modi di barare.
//
// Gira su una COPIA del database. Dura una ventina di secondi: le
// attese sono vere, perche' e' proprio il tempo che l'anti-cheat misura.
//
// Uso:  node strumenti/prova_azioni.js
// ===================================================================
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RADICE = path.join(__dirname, '..');
const PORTA = 3998;
const BASE = `http://127.0.0.1:${PORTA}`;
const PASSWORD = 'prova-azioni-1234';

// Gli stessi numeri che usa il server. Se qualcuno li cambia di la' e non
// qui, le prove falliscono: ed e' voluto, sono tarature che vanno riviste
// insieme e non di nascosto.
const MIN_GAME_SEC = 3;
const BASE_ALLOWANCE = 400;
const MAX_SCORE_PER_SEC = 420;
const SLOT_BET_MIN = 5;

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0, ko = 0;
function esito(passa, titolo, dettaglio) {
  if (passa) { ok++; console.log(`  · ${titolo}`); }
  else { ko++; console.log(`  ✗ ${titolo}\n      ${dettaglio}`); }
}

function creaSessione() {
  let cookie = '';
  const assorbi = (res) => {
    for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
      const kv = c.split(';')[0];
      const nome = kv.split('=')[0];
      cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== nome), kv].join('; ');
    }
  };
  const s = {
    csrf: '',
    async get(via) {
      const r = await fetch(BASE + via, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
      assorbi(r); return r;
    },
    async postJson(via, corpo) {
      const r = await fetch(BASE + via, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': s.csrf },
        body: JSON.stringify(corpo || {}), redirect: 'manual',
      });
      assorbi(r); return r;
    },
    async postForm(via, campi) {
      const r = await fetch(BASE + via, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...campi, _csrf: s.csrf }), redirect: 'manual',
      });
      assorbi(r); return r;
    },
    async postFile(via, campi, nomeCampo, file, nomeFile) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(campi)) fd.append(k, v);
      fd.append('_csrf', s.csrf);
      fd.append(nomeCampo, new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), nomeFile);
      const r = await fetch(BASE + via, { method: 'POST', headers: { cookie }, body: fd, redirect: 'manual' });
      assorbi(r); return r;
    },
    async login(nickname) {
      const html = await (await s.get('/login')).text();
      const tok = (html.match(/name="_csrf" value="([^"]+)"/) || [])[1] || '';
      const r = await fetch(BASE + '/login', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ nickname, password: PASSWORD, _csrf: tok }), redirect: 'manual',
      });
      assorbi(r);
      // il token di sessione serve per tutte le POST successive
      const dopo = await (await s.get('/')).text();
      s.csrf = (dopo.match(/name="csrf-token" content="([^"]+)"/) || [])[1] || '';
      return r.status === 302;
    },
  };
  return s;
}

(async () => {
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'fsr-azioni-'));
  const vero = path.join(RADICE, 'data', 'fantasanrocco.db');
  if (fs.existsSync(vero)) fs.copyFileSync(vero, path.join(cartella, 'fantasanrocco.db'));
  fs.mkdirSync(path.join(cartella, 'uploads'), { recursive: true });

  // VAPID svuotate di proposito: senza chiavi il server mette PUSH_ENABLED a
  // false e nessuna notifica parte. Il database di prova e' una COPIA di
  // quello vero e contiene gli endpoint REALI dei dispositivi iscritti:
  // caricare una foto avvisa lo staff, e senza questa riga la prova
  // suonerebbe il telefono di qualcuno ogni volta che la si lancia.
  const srv = spawn(process.execPath, [path.join(RADICE, 'src', 'server.js')], {
    cwd: RADICE,
    env: {
      ...process.env,
      DATA_DIR: cartella, PORT: String(PORTA), SECURE_COOKIES: 'false',
      VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  const chiudi = (c) => { try { srv.kill('SIGTERM'); } catch {} fs.rmSync(cartella, { recursive: true, force: true }); process.exit(c); };

  let su = false;
  for (let i = 0; i < 60 && !su; i++) { try { await fetch(BASE + '/health'); su = true; } catch { await attesa(250); } }
  if (!su) { console.error('Il server non risponde:\n' + log); chiudi(1); }

  const Database = require(path.join(RADICE, 'node_modules', 'better-sqlite3'));
  const bcrypt = require(path.join(RADICE, 'node_modules', 'bcryptjs'));
  const db = new Database(path.join(cartella, 'fantasanrocco.db'));
  const h = bcrypt.hashSync(PASSWORD, 10);
  const crea = (nick, ruolo) => {
    db.prepare('DELETE FROM users WHERE nickname = ?').run(nick);
    db.prepare(`INSERT INTO users (nickname,email,password_hash,role,created_at,totp_enabled,privacy_accepted_at)
                VALUES (?,?,?,?,datetime('now'),0,datetime('now'))`).run(nick, nick + '@prova.local', h, ruolo);
    return db.prepare('SELECT id FROM users WHERE nickname = ?').get(nick).id;
  };
  const idGiocatore = crea('prova_gioca', 'user');
  crea('prova_staff', 'admin');
  // punti di partenza, per poter puntare alla slot
  db.prepare('UPDATE users SET points_adjust = 1000 WHERE id = ?').run(idGiocatore);

  const g = creaSessione(); const staff = creaSessione();
  if (!await g.login('prova_gioca') || !await staff.login('prova_staff')) { console.error('login fallito'); chiudi(1); }

  const punti = () => db.prepare('SELECT points_adjust FROM users WHERE id = ?').get(idGiocatore).points_adjust;
  const utente = () => db.prepare('SELECT * FROM users WHERE id = ?').get(idGiocatore);
  const corse = (gioco) => db.prepare('SELECT COUNT(*) c FROM game_runs WHERE game = ?').get(gioco).c;
  // Il totale in classifica, calcolato QUI sulla copia con la stessa formula
  // del server. NON si importa lib/classifica: quel modulo apre il database
  // indicato da DATA_DIR, che in questo processo non e' impostato — andrebbe
  // a finire sul database VERO, e una prova non deve poterlo nemmeno sfiorare.
  const totale = () => db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN s.status='approved' THEN m.points ELSE 0 END), 0) + u.points_adjust AS p
    FROM users u
    LEFT JOIN submissions s ON s.user_id = u.id
    LEFT JOIN missions m    ON m.id = s.mission_id
    WHERE u.id = ? GROUP BY u.id`).get(idGiocatore).p;

  // ══ ANTI-CHEAT: «Corri San Rocco» ══════════════════════════════════
  console.log('\nANTI-CHEAT · Corri San Rocco');
  {
    const prima = corse('runner');
    const t = (await (await g.postJson('/gioco/inizio')).json()).token;
    await attesa((MIN_GAME_SEC + 2) * 1000);                 // partita vera di 5 secondi
    const r = await (await g.postJson('/gioco/punteggio', { score: 800, token: t })).json();
    const u = utente();
    esito(r.ok && u.game_best === 800, 'una partita onesta viene accettata per intero',
      `atteso record 800, trovato ${u.game_best}`);
    esito(u.game_plays === 1, 'e conta come partita giocata', `partite: ${u.game_plays}`);
    esito(corse('runner') === prima + 1, 'e lascia una riga nello storico dei tempi',
      `righe: ${prima} → ${corse('runner')}`);
    const riga = db.prepare('SELECT seconds FROM game_runs WHERE game=? ORDER BY id DESC LIMIT 1').get('runner');
    esito(riga && riga.seconds >= MIN_GAME_SEC && riga.seconds < 15,
      `con la durata vera (${riga ? riga.seconds : '?'}s, non zero e non inventata)`, JSON.stringify(riga));
  }
  {
    const t = (await (await g.postJson('/gioco/inizio')).json()).token;
    await attesa(4000);
    const r = await (await g.postJson('/gioco/punteggio', { score: 26000, token: t })).json();
    const tetto = BASE_ALLOWANCE + 6 * MAX_SCORE_PER_SEC;    // margine largo sui 4s reali
    esito(r.best < 26000 && r.best <= tetto, 'un punteggio gonfiato viene tagliato dal tempo trascorso',
      `dichiarati 26000, accettati ${r.best} (il tetto per ~4s sta sotto ${tetto})`);
  }
  {
    const prima = corse('runner');
    const u0 = utente();
    const r = await (await g.postJson('/gioco/punteggio', { score: 26000 })).json();  // niente ticket
    esito(r.best <= u0.game_best + 3000, 'senza ticket la crescita è limitata',
      `record ${u0.game_best} → ${r.best}`);
    esito(corse('runner') === prima, 'e la partita non entra nello storico', `righe: ${prima} → ${corse('runner')}`);
  }
  {
    const prima = corse('runner');
    const u0 = utente();
    const t = (await (await g.postJson('/gioco/inizio')).json()).token;
    await (await g.postJson('/gioco/punteggio', { score: 26000, token: t })).json();  // chiusa all'istante
    esito(utente().game_plays === u0.game_plays, 'una partita lampo non conta come giocata',
      `partite: ${u0.game_plays} → ${utente().game_plays}`);
    esito(corse('runner') === prima, 'e non sporca i tempi medi', `righe: ${prima} → ${corse('runner')}`);
  }

  // ══ ANTI-CHEAT: «San Rocco Jetpack» ════════════════════════════════
  console.log('\nANTI-CHEAT · San Rocco Jetpack');
  {
    const prima = corse('jetpack');
    const t = (await (await g.postJson('/jetpack/inizio')).json()).token;
    await attesa((MIN_GAME_SEC + 2) * 1000);
    const r = await (await g.postJson('/jetpack/fine', {
      dist: 400, points: 200, coins: 20, knocked: 3, halos: 0, transforms: 0, token: t,
    })).json();
    esito(r.counted === true, 'una partita onesta viene contata', JSON.stringify(r).slice(0, 120));
    esito(utente().jp_best === 400, 'e alza il record in metri', `record: ${utente().jp_best}`);
    esito(corse('jetpack') === prima + 1, 'e lascia la sua riga nei tempi', `righe: ${prima} → ${corse('jetpack')}`);
  }
  {
    const prima = corse('jetpack');
    const r = await (await g.postJson('/jetpack/fine', { dist: 99999, token: 'inventato' })).json();
    esito(r.counted === false, 'con un ticket inventato la partita non conta', JSON.stringify(r).slice(0, 120));
    esito(corse('jetpack') === prima, 'e non lascia traccia', `righe: ${prima} → ${corse('jetpack')}`);
  }

  // ══ RUOTA ══════════════════════════════════════════════════════════
  console.log('\nRUOTA DELLA FORTUNA');
  {
    const p0 = punti();
    const r = await (await g.postJson('/ruota/gira')).json();
    esito(r.ok === true, 'il primo giro del giorno è concesso', JSON.stringify(r).slice(0, 100));
    esito(punti() === p0 + r.points, 'e i punti vinti finiscono davvero sul saldo',
      `${p0} + ${r.points} atteso ${p0 + r.points}, trovato ${punti()}`);
    const r2 = await (await g.postJson('/ruota/gira')).json();
    esito(r2.ok === false, 'il secondo giro nello stesso giorno viene rifiutato', JSON.stringify(r2).slice(0, 100));
  }

  // ══ SLOT ═══════════════════════════════════════════════════════════
  console.log('\nSLOT');
  {
    const bassa = await g.postJson('/slot/gira', { bet: SLOT_BET_MIN - 1 });
    esito(bassa.status === 400, 'una puntata sotto il minimo viene rifiutata', 'HTTP ' + bassa.status);
    const p0 = punti();
    const r = await (await g.postJson('/slot/gira', { bet: 10 })).json();
    // `win` e' un si'/no: la cifra che sposta il saldo e' `net` (vincita meno puntata)
    const atteso = p0 + r.net;
    esito(r.ok === true, 'una puntata valida gira', JSON.stringify(r).slice(0, 110));
    esito(punti() === atteso, 'e il saldo cambia esattamente del netto della giocata',
      `${p0} + (${r.net}) = ${atteso}, trovato ${punti()}`);
    // `balance` e' il totale in classifica (missioni + saldo extra), non il solo
    // points_adjust: si confronta con la stessa formula, non con punti().
    esito(r.balance === totale(), 'e il saldo che risponde combacia con la classifica',
      `risposta ${r.balance}, classifica ${totale()}`);
  }

  // ══ PROVA CON FOTO + MODERAZIONE ═══════════════════════════════════
  console.log('\nINVIO PROVA E MODERAZIONE');
  {
    const miss = db.prepare(`SELECT id, points FROM missions
      WHERE game_key IS NULL AND archived = 0 AND active_from IS NULL LIMIT 1`).get();
    // una foto vera, presa dalle prove gia' caricate (o generata se non ce ne sono)
    const dir = path.join(RADICE, 'data', 'uploads');
    let foto = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(jpg|jpeg|png)$/i.test(f))[0] : null;
    foto = foto ? path.join(dir, foto) : null;
    if (!miss || !foto) {
      esito(false, 'invio prova', 'manca una missione libera o una foto di esempio: prova saltata');
    } else {
      const primaN = db.prepare('SELECT COUNT(*) c FROM submissions').get().c;
      const r = await g.postFile(`/missioni/${miss.id}/invia`, { note: 'prova automatica' }, 'foto', foto, 'prova.jpg');
      const dopoN = db.prepare('SELECT COUNT(*) c FROM submissions').get().c;
      esito(dopoN === primaN + 1, 'la prova con foto viene registrata', `HTTP ${r.status}, righe ${primaN} → ${dopoN}`);
      const sub = db.prepare('SELECT * FROM submissions ORDER BY id DESC LIMIT 1').get();
      esito(sub && sub.status === 'pending', 'e resta in attesa di moderazione', `stato: ${sub && sub.status}`);
      esito(sub && sub.photo_path && fs.existsSync(path.join(cartella, 'uploads', sub.photo_path)),
        'con il file salvato su disco', `file: ${sub && sub.photo_path}`);
      esito(sub && !!sub.phash, "e l'impronta calcolata per riconoscere i duplicati", `impronta: ${sub && sub.phash}`);

      // stessa foto una seconda volta: il controllo duplicati deve accorgersene
      const primaDup = db.prepare("SELECT COUNT(*) c FROM submissions WHERE status='pending'").get().c;
      await g.postFile(`/missioni/${miss.id}/invia`, { note: 'stessa foto' }, 'foto', foto, 'prova.jpg');
      const dopoDup = db.prepare("SELECT COUNT(*) c FROM submissions WHERE status='pending'").get().c;
      esito(dopoDup === primaDup, 'la stessa foto rimandata non crea una seconda prova in attesa',
        `in attesa: ${primaDup} → ${dopoDup}`);

      // approvazione: i punti della missione devono entrare in classifica
      const prima = totale();
      const ra = await staff.postForm(`/moderazione/${sub.id}/approva`, { review_note: '' });
      const dopo = totale();
      esito(ra.status === 302 || ra.status === 200, "l'approvazione va a buon fine", 'HTTP ' + ra.status);
      esito(dopo === prima + miss.points, 'e i punti della missione entrano in classifica',
        `${prima} + ${miss.points} atteso ${prima + miss.points}, trovato ${dopo}`);
    }
  }

  const errori = (log.match(/^\s*(Error|TypeError|ReferenceError)/gm) || []).length;
  if (errori) { ko += errori; console.log(`\n✗ ${errori} errori nel log del server`); }
  console.log(`\n${ko === 0 ? '✓ tutto a posto' : '✗ ' + ko + ' problemi'} — ${ok + ko} controlli`);
  db.close();
  chiudi(ko === 0 ? 0 : 1);
})();
