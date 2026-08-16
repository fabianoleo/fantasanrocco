// ===================================================================
// FantaSanRocco — Chi ha smesso di giocare, e perché sembra
// -------------------------------------------------------------------
// Il pannello statistiche dice quanto si gioca in totale. Questo dice
// una cosa diversa: se le persone MOLLANO, quante, e a che punto.
// Legge e basta, non scrive niente.
//
//   node strumenti/abbandoni.js          soglia: fermo da 24 ore
//   node strumenti/abbandoni.js 48       fermo da 48 ore
//
// LA DOMANDA A CUI SERVE RISPONDERE
// «Il gioco è troppo lungo o troppo impegnativo?» non si vede da una
// media. Si vede da DOVE si fermano: se chi smette aveva fatto due
// missioni, il gioco non ha ingranato — è un problema di partenza. Se
// chi smette ne aveva fatte venti, è stanchezza: ha dato quello che
// aveva e l'elenco continuava a chiedere. Sono due mali opposti e si
// curano al contrario, per questo il conto va spezzato.
// ===================================================================
const { db } = require('../src/db');

const ORE_FERMO = Number(process.argv[2] || 24);
const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());

const barra = (n, max, largo = 28) => '█'.repeat(Math.max(0, Math.round((n / (max || 1)) * largo)));
const perc = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

// ── 1. QUANTE PERSONE GIOCANO OGNI GIORNO ───────────────────────────
// Il numero che conta non è quante prove arrivano, ma quante PERSONE
// diverse le mandano: mille foto da dieci accaniti non sono una festa.
const perGiorno = db.prepare(`
  SELECT date(created_at, '+2 hours') AS g,
         COUNT(DISTINCT user_id) AS persone,
         COUNT(*) AS prove
  FROM submissions GROUP BY g ORDER BY g
`).all();

console.log('QUANTE PERSONE MANDANO PROVE, GIORNO PER GIORNO');
const maxP = Math.max(...perGiorno.map((r) => r.persone), 1);
for (const r of perGiorno) {
  const nuovi = db.prepare(`
    SELECT COUNT(*) n FROM (
      SELECT user_id, MIN(date(created_at, '+2 hours')) AS primo
      FROM submissions GROUP BY user_id) WHERE primo = ?`).get(r.g).n;
  console.log(`  ${r.g}  ${String(r.persone).padStart(4)} persone `
    + `${barra(r.persone, maxP)}  ${r.prove} prove · ${nuovi} al debutto`);
}

// ── 2. CHI SI È FERMATO ─────────────────────────────────────────────
const fermi = db.prepare(`
  SELECT u.id, u.nickname,
         COUNT(*) AS quante,
         MAX(s.created_at) AS ultima,
         MIN(s.created_at) AS prima
  FROM submissions s JOIN users u ON u.id = s.user_id
  WHERE u.role = 'user'
  GROUP BY s.user_id
  HAVING MAX(s.created_at) < datetime('now', ?)
`).all(`-${ORE_FERMO} hours`);

const attivi = db.prepare(`
  SELECT COUNT(DISTINCT s.user_id) n FROM submissions s JOIN users u ON u.id = s.user_id
  WHERE u.role = 'user' AND s.created_at >= datetime('now', ?)`).get(`-${ORE_FERMO} hours`).n;

const conPr = fermi.length + attivi;
console.log(`\nCHI HA GIOCATO ALMENO UNA VOLTA: ${conPr}`);
console.log(`  ancora in pista (ultime ${ORE_FERMO}h)  ${String(attivi).padStart(4)}  ${perc(attivi, conPr)}%`);
console.log(`  fermi da più di ${ORE_FERMO}h${' '.repeat(Math.max(0, 12 - String(ORE_FERMO).length))}${String(fermi.length).padStart(4)}  ${perc(fermi.length, conPr)}%`);

// ── 3. IL PUNTO IN CUI SI FERMANO ───────────────────────────────────
// È la domanda vera: chi molla, quanto aveva fatto?
const scaglioni = [
  ['1 sola prova      ', (n) => n === 1],
  ['2-4 prove         ', (n) => n >= 2 && n <= 4],
  ['5-9 prove         ', (n) => n >= 5 && n <= 9],
  ['10-19 prove       ', (n) => n >= 10 && n <= 19],
  ['20 o più prove    ', (n) => n >= 20],
];
console.log('\nCHI SI È FERMATO, QUANTO AVEVA FATTO');
const maxS = Math.max(...scaglioni.map(([, f]) => fermi.filter((x) => f(x.quante)).length), 1);
for (const [nome, f] of scaglioni) {
  const q = fermi.filter((x) => f(x.quante)).length;
  console.log(`  ${nome} ${String(q).padStart(4)} persone ${barra(q, maxS, 22)} ${perc(q, fermi.length)}%`);
}
const mollatiSubito = fermi.filter((x) => x.quante <= 2).length;
const mollatiDopo = fermi.filter((x) => x.quante >= 10).length;
console.log('');
if (perc(mollatiSubito, fermi.length) >= 50) {
  console.log('  → Più della metà si è fermata entro due prove: il problema è');
  console.log('    L\'INGRESSO, non la lunghezza. Non hanno mai ingranato.');
} else if (perc(mollatiDopo, fermi.length) >= 40) {
  console.log('  → Molti si fermano dopo dieci o più prove: quello è consumo,');
  console.log('    non rifiuto. Hanno dato quello che avevano.');
} else {
  console.log('  → Gli abbandoni sono sparsi: nessuno scalino evidente.');
}

// ── 4. QUANTE MISSIONI FA UNA PERSONA, DAVVERO ──────────────────────
const conteggi = db.prepare(`
  SELECT COUNT(DISTINCT mission_id) c FROM submissions s
  JOIN users u ON u.id = s.user_id
  WHERE u.role = 'user' AND s.status = 'approved'
  GROUP BY s.user_id ORDER BY c
`).all().map((r) => r.c);
const mediana = conteggi.length ? conteggi[Math.floor(conteggi.length / 2)] : 0;
const disponibili = db.prepare(`
  SELECT COUNT(*) n FROM missions WHERE archived = 0 AND game_key IS NULL`).get().n;

console.log('\nIL CATALOGO È TROPPO GRANDE?');
console.log(`  missioni visibili adesso        ${String(disponibili).padStart(4)}`);
console.log(`  quante ne fa una persona tipica ${String(mediana).padStart(4)}  (mediana di chi ha almeno una prova approvata)`);
console.log(`  quante ne fa chi va più forte    ${String(conteggi.length ? conteggi[conteggi.length - 1] : 0).padStart(4)}`);
if (disponibili && mediana) {
  const q = perc(mediana, disponibili);
  console.log(`  la persona tipica arriva al ${q}% dell'elenco`);
  if (q < 15) {
    console.log('  → L\'elenco è molto più lungo di quanto chiunque riesca a fare.');
    console.log('    Non è per forza un male: la scelta è il gioco. Diventa un male');
    console.log('    se la pagina scoraggia — è la ragione per cui il 15 e il 16');
    console.log('    ne sono state nascoste trentasei.');
  }
}

// ── 5. LE MISSIONI CHE NON FA NESSUNO ───────────────────────────────
// Una missione che in cinque giorni non ha completato nessuno o quasi
// è scritta male, è troppo difficile, o chiede una cosa che non capita.
// Si contano SOLO quelle aperte da almeno un giorno. Senza questo filtro
// l'elenco si riempiva di missioni delle serate che devono ancora venire —
// undici su dodici, in una prova — e uno perdeva tempo a chiedersi cosa
// c'era di sbagliato in una missione che semplicemente non è ancora il suo
// turno.
const morte = db.prepare(`
  SELECT m.title, m.points, m.active_from,
         (SELECT COUNT(DISTINCT s.user_id) FROM submissions s
          WHERE s.mission_id = m.id AND s.status = 'approved') AS fatte
  FROM missions m
  WHERE m.archived = 0 AND m.game_key IS NULL
    AND (m.active_from IS NULL OR m.active_from <= datetime('now', '-1 day'))
  ORDER BY fatte ASC, m.points DESC LIMIT 12
`).all();
console.log('\nLE MISSIONI CHE QUASI NESSUNO COMPLETA');
console.log('  (solo quelle aperte da almeno un giorno: le serate future non contano)');
morte.forEach((r) => console.log(`  ${String(r.fatte).padStart(3)} persone · ${String(r.points).padStart(3)}pt · ${r.title}`
  + (r.active_from ? '   (dal ' + r.active_from.slice(5, 10) + ')' : '')));
console.log('  → Zero o quasi su una missione già aperta da un giorno vuol dire');
console.log('    una di tre cose: è scritta in modo poco chiaro, è troppo');
console.log('    difficile, o chiede una cosa che non capita.');

// ── 6. QUANTI SI SONO ISCRITTI E NON HANNO MAI GIOCATO ──────────────
const iscritti = db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'user'").get().n;
const maiGiocato = iscritti - conPr;
console.log('\nISCRITTI CHE NON HANNO MAI MANDATO UNA PROVA');
console.log(`  ${maiGiocato} su ${iscritti}  (${perc(maiGiocato, iscritti)}%)`);
if (perc(maiGiocato, iscritti) >= 30) {
  const q = perc(maiGiocato, iscritti);
  console.log(`  → ${q > 50 ? 'PIÙ DELLA METÀ' : 'Quasi un terzo'} degli iscritti non ha mai cominciato.`);
  console.log('    Qui non c\'entra la lunghezza del gioco: o non hanno capito come');
  console.log('    si gioca, o si sono iscritti e basta. È il gruppo più grande su');
  console.log('    cui si può ancora recuperare, e non serve cambiare le missioni.');
}
console.log(`\n(dati al ${oggi}, ora italiana)`);
