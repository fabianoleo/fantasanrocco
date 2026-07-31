// ===================================================================
// FantaSanRocco — LE QUATTRO SEZIONI delle missioni
// -------------------------------------------------------------------
// Completare tutte le missioni di una sezione vale SECTION_BONUS punti.
// Aggiungere o togliere una missione da una sezione ne cambia la
// difficolta': e' il motivo per cui i conti stanno scritti nel seed.
// ===================================================================

const SECTIONS = [
  { key: 'paese',  label: 'Paese & Tradizione',     color: 'gold' },
  { key: 'food',   label: 'Food & Drink',           color: 'green' },
  { key: 'social', label: 'Social & Party',         color: 'purple' },
  { key: 'sport',  label: 'Sport, Team & Comunità', color: 'blue' },
];
const SECTION_BONUS = 100;

module.exports = { SECTIONS, SECTION_BONUS };
