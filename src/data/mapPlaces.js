// ===================================================================
// Mappa interattiva di Siano — dati luoghi + eventi
// -------------------------------------------------------------------
// I luoghi derivano dai luoghi REALI già citati nella programmazione
// (/programmazione). Nessun luogo/descrizione inventato.
//
// coordinates: formato LEAFLET → [latitudine, longitudine]
//   • metti [lat, lng] per mostrare il marker sulla mappa
//   • lascia null per i luoghi di cui non hai ancora le coordinate
//     (NON verranno mostrati come marker, compaiono solo nella lista
//      "da posizionare", facili da completare qui sotto).
//
// ► PER AGGIUNGERE/RIFINIRE UN LUOGO: modifica solo questo file.
// ===================================================================

const PLACES = [
  {
    id: 'piazza-san-rocco',
    name: 'Piazza San Rocco',
    coordinates: [40.801684, 14.691398], // da OpenStreetMap
    address: 'Siano (SA)',
    description: '',   // nessuna descrizione inventata: aggiungila tu se vuoi
    image: '',
  },
  {
    id: 'piazza-borsellino',
    name: 'Piazza Borsellino',
    coordinates: [40.801869, 14.687583], // da OpenStreetMap (way 410881035)
    address: 'Via Santa Maria delle Grazie, Siano (SA)',
    description: '',
    image: '',
  },
  {
    id: 'siano-centro',
    name: 'Siano — Vie del centro',
    coordinates: null, // TODO: aggiungi [lat, lng] (processione e street band girano per le vie)
    address: 'Siano (SA)',
    description: '',
    image: '',
  },
];

// Eventi: rispecchiano la pagina /programmazione (stessi titoli, orari, luogo).
// "location" = testo del luogo mostrato sul sito; serve a collegare l'evento al luogo.
const EVENTS = [
  { title: 'Mazzariello — DJ Set',                 day: 'Ven 14', time: '00:00', location: 'Piazza San Rocco, Siano' },
  { title: 'Groove Motion Live Band',              day: 'Ven 14', time: '21:30', location: 'Siano' },
  { title: 'Napoliitudine con Sal Esposito',       day: 'Sab 15', time: '21:30', location: 'Piazza San Rocco, Siano', image: '/images/artisti/napoliitudine.jpg' },
  { title: 'Alfo V. & Mike Carotenuto DJ',         day: 'Dom 16', time: '00:00', location: 'Siano' },
  { title: 'La Processione di San Rocco',          day: 'Dom 16', time: '17:00', location: 'Vie di Siano' },
  { title: 'Disco Inferno',                        day: 'Lun 17', time: '00:00', location: 'Siano' },
  { title: 'LDA & Aka 7even',                      day: 'Lun 17', time: '21:30', location: 'Piazza Borsellino, Siano', image: '/images/artisti/lda-aka7even.jpg' },
  { title: 'Luna Park',                            day: 'Mar 18', time: '10:30', location: 'Siano' },
  { title: 'Vagaband',                             day: 'Mar 18', time: '18:30', location: 'Strade di Siano' },
  { title: 'Palio dei Fuochi',                     day: 'Mar 18', time: '23:30', location: 'Siano' },
];

// Normalizza il testo "location" di un evento → id del luogo sulla mappa.
function placeIdForLocation(loc) {
  const s = (loc || '').toLowerCase();
  if (s.includes('san rocco')) return 'piazza-san-rocco';
  if (s.includes('borsellino')) return 'piazza-borsellino';
  // "Siano", "Vie di Siano", "Strade di Siano" → centro/vie del paese
  return 'siano-centro';
}

// Restituisce i luoghi con gli eventi collegati (per la view/mappa).
function placesWithEvents() {
  return PLACES.map((p) => ({
    id: p.id,
    name: p.name,
    coordinates: p.coordinates,         // [lat, lng] o null
    address: p.address || '',
    description: p.description || '',
    image: p.image || '',
    events: EVENTS.filter((e) => placeIdForLocation(e.location) === p.id)
      .map((e) => ({ title: e.title, day: e.day, time: e.time, image: e.image || '' })),
  }));
}

module.exports = { PLACES, EVENTS, placeIdForLocation, placesWithEvents };
