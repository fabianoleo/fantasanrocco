// ===================================================================
// FantaSanRocco — LE QUATTRO SEZIONI delle missioni
// -------------------------------------------------------------------
// Completare TUTTE le missioni di una sezione vale il bonus della
// sezione. Il bonus NON e' piu' uguale per tutte: segue quante tappe
// ha la sezione, perche' finire Social (21 missioni) e' un altro
// mestiere rispetto a finire Food (10).
//
//   food    10 tappe  ->  75
//   sport   13 tappe  -> 100
//   paese   18 tappe  -> 125
//   social  21 tappe  -> 125
//
// Aggiungere o togliere una missione da una sezione ne cambia la
// difficolta': e' il motivo per cui i conti stanno scritti nel seed.
// Se il numero di tappe si sposta parecchio, rivedi anche il bonus.
// ===================================================================

const SECTIONS = [
  { key: 'paese',  label: 'Paese & Tradizione',     color: 'gold',   bonus: 125 },
  { key: 'food',   label: 'Food & Drink',           color: 'green',  bonus: 75 },
  // 150 e non 125: il 13 agosto la sezione e' passata da 19 a 23 missioni, e
  // le quattro entrate sono fra le piu' impegnative del gioco (tingersi i
  // capelli, mezza barba, cinque calvi, un video di gruppo immobile in
  // piazza). Il bonus si prende completando TUTTA la sezione: lasciandolo a
  // 125 sarebbe diventata la piu' dura da chiudere e la meno pagata.
  // Chi l'aveva gia' preso ha incassato 125: il bonus si da' una volta sola e
  // non si ricalcola: non si tolgono punti a nessuno, e i 25 di differenza
  // non valgono un giro di storni.
  { key: 'social', label: 'Social & Party',         color: 'purple', bonus: 150 },
  { key: 'sport',  label: 'Sport, Team & Comunità', color: 'blue',   bonus: 100 },
];

// Quanto vale finire una sezione. Si passa la CHIAVE, non l'oggetto: chi
// chiama ha quasi sempre solo quella, perche' arriva dal database. Il 100
// di riserva serve se un giorno spunta una sezione senza bonus scritto:
// meglio accreditare il valore storico che rompere l'accredito.
function sectionBonus(key) {
  const s = SECTIONS.find((x) => x.key === key);
  return s && typeof s.bonus === 'number' ? s.bonus : 100;
}

// Il bonus piu' alto in circolazione. Serve ai testi che promettono il
// premio prima di sapere di quale sezione si parla ("fino a N punti").
const SECTION_BONUS_MAX = Math.max(...SECTIONS.map((s) => s.bonus));

module.exports = { SECTIONS, sectionBonus, SECTION_BONUS_MAX };
