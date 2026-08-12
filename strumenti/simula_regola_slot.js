// ===================================================================
// FantaSanRocco — La regola completa della slot, applicata al passato
// -------------------------------------------------------------------
// NON SCRIVE NIENTE.
//
// La regola che si vuole annunciare è una frase sola:
//   «in classifica i punti della slot valgono un decimo,
//    e comunque non più di N punti al giorno»
//
// Questo script la applica a TUTTE le giocate già fatte, come se fosse
// valsa dall'inizio, e mostra che classifica ne esce.
//
// Uso (in produzione, dentro il container):
//   cd /app && node strumenti/simula_regola_slot.js 0.1:250 0.1:500
//   cd /app && node strumenti/simula_regola_slot.js 0.1:250 0.25:250 0.1:0
//                                    (tetto 0 = nessun tetto, solo il peso)
//
// L'ORDINE CONTA e non è un dettaglio: prima si pesa, poi si taglia. Cosi'
// il tetto è quello che la gente legge in classifica ("non più di 250 al
// giorno"), non un numero interno da cui poi si ricava altro.
//
// Il tetto vale solo sui GUADAGNI della giornata: le perdite passano pesate
// e basta. Mettere un pavimento simmetrico vorrebbe dire che dopo una brutta
// serata la classifica non se ne accorge, e la slot smetterebbe di essere una
// scommessa.
//
// IL GIORNO è quello del calendario italiano (UTC+2 in agosto), non il
// "giorno-festa" delle missioni che parte alle 18: la frase dice "al giorno"
// e deve voler dire quello che sembra.
// ===================================================================
const { db } = require('../src/db');

const REGOLE = process.argv.slice(2).map((a) => {
  const [p, t] = a.split(':');
  return { peso: Number(p), tetto: Number(t || 0) };
}).filter((r) => Number.isFinite(r.peso) && Number.isFinite(r.tetto));
if (!REGOLE.length) REGOLE.push({ peso: 0.1, tetto: 250 });

const num = (v) => Math.round(v).toLocaleString('it-IT');
const QUANTI = 20;

const righe = db.prepare(`
  SELECT u.id, u.nickname,
         COALESCE(SUM(CASE WHEN s.status='approved' THEN m.points ELSE 0 END), 0) + u.points_adjust AS punti,
         (u.game_best + u.jp_best) AS spareggio,
         u.created_at
  FROM users u
  LEFT JOIN submissions s ON s.user_id = u.id
  LEFT JOIN missions m    ON m.id = s.mission_id
  WHERE u.role = 'user'
  GROUP BY u.id
`).all();

// Il netto della slot GIORNO PER GIORNO: senza questo il tetto giornaliero
// non si può calcolare, e sul totale darebbe un numero diverso.
const perGiorno = new Map();   // user_id → [{ giorno, netto }]
for (const r of db.prepare(`
  SELECT user_id, date(created_at, '+2 hours') AS giorno, SUM(delta) AS netto
  FROM punti_movimenti WHERE causa = 'slot'
  GROUP BY user_id, giorno
`).all()) {
  if (!perGiorno.has(r.user_id)) perGiorno.set(r.user_id, []);
  perGiorno.get(r.user_id).push(r);
}

const ordina = (a, b) => (b.punti - a.punti) || (b.spareggio - a.spareggio)
  || (a.created_at < b.created_at ? -1 : 1);
const prima = righe.map((r) => ({ ...r })).sort(ordina);
const posPrima = new Map(prima.map((r, i) => [r.id, i + 1]));

const giorniTot = new Set();
for (const gg of perGiorno.values()) for (const g of gg) giorniTot.add(g.giorno);

console.log('');
console.log(`GIOCATORI: ${righe.length} · hanno giocato alla slot: ${perGiorno.size}`);
console.log(`Giornate di gioco nel registro: ${giorniTot.size} (${[...giorniTot].sort().join(', ')})`);

for (const { peso, tetto } of REGOLE) {
  console.log('');
  console.log('═'.repeat(82));
  console.log(`REGOLA: la slot vale il ${(peso * 100).toFixed(0)}%`
    + (tetto ? `, e non più di ${num(tetto)} punti al giorno` : ', senza tetto giornaliero'));
  console.log('═'.repeat(82));

  let giorniTagliati = 0;
  const dopo = righe.map((r) => {
    const gg = perGiorno.get(r.id) || [];
    let nettoVero = 0, contato = 0;
    for (const g of gg) {
      nettoVero += g.netto;
      let c = g.netto * peso;
      if (tetto && c > tetto) { c = tetto; giorniTagliati++; }
      contato += c;
    }
    const differenza = contato - nettoVero;
    return { ...r, nettoVero, contato, differenza, punti: r.punti + differenza };
  }).sort(ordina);

  const giu = dopo.filter((r) => r.differenza < -0.5);
  const su = dopo.filter((r) => r.differenza > 0.5);
  console.log(`Perdono punti: ${giu.length} · ne riprendono: ${su.length}`
    + ` · invariati: ${righe.length - giu.length - su.length}`
    + (tetto ? ` · giornate toccate dal tetto: ${giorniTagliati}` : ''));

  console.log('');
  console.log('pos  giocatore              punti ora  →   con la regola     slot   differenza   era');
  console.log('─'.repeat(82));
  dopo.slice(0, QUANTI).forEach((r, i) => {
    const era = posPrima.get(r.id);
    const fre = era === i + 1 ? '  ' : (era > i + 1 ? '▲' : '▼');
    console.log(
      String(i + 1).padStart(3),
      (r.nickname || '?').slice(0, 20).padEnd(22),
      num(r.punti - r.differenza).padStart(9),
      ' →',
      num(r.punti).padStart(14),
      num(r.nettoVero).padStart(9),
      (r.differenza > 0 ? '+' + num(r.differenza) : num(r.differenza)).padStart(12),
      ` ${fre}${era}`
    );
  });

  const mosse = [...giu].sort((a, b) => a.differenza - b.differenza).slice(0, 4);
  if (mosse.length) {
    console.log('');
    console.log('Chi ci perde di più (aveva vinto alla slot):');
    for (const r of mosse) {
      const gg = perGiorno.get(r.id) || [];
      console.log(`   ${(r.nickname || '?').slice(0, 20).padEnd(22)} ${num(r.differenza)}`
        + `  (${num(r.punti - r.differenza)} → ${num(r.punti)}, dal ${posPrima.get(r.id)}º al ${dopo.indexOf(r) + 1}º`
        + `, ha giocato in ${gg.length} giornate: la slot gli conta ${num(r.contato)} invece di ${num(r.nettoVero)})`);
    }
  }

  console.log('');
  const np = dopo[0], vp = prima[0];
  console.log(np.id !== vp.id
    ? `⚠️  CAMBIA IL PRIMO: era ${vp.nickname} (${num(vp.punti)}), diventa ${np.nickname} (${num(np.punti)}).`
    : `Il primo resta ${np.nickname}: ${num(vp.punti)} → ${num(np.punti)}.`);
  console.log(`Secondo: ${dopo[1].nickname} (${num(dopo[1].punti)}) · distacco dal primo: ${num(dopo[0].punti - dopo[1].punti)}`);
  console.log(`Posizioni che cambiano: ${dopo.filter((r, i) => posPrima.get(r.id) !== i + 1).length} su ${righe.length}.`);
}

console.log('');
console.log('Questo script non ha scritto niente.');
console.log('');
