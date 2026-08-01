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
  { key: 'social', label: 'Social & Party',         color: 'purple', bonus: 125 },
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
