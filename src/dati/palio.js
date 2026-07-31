// ===================================================================
// FantaSanRocco — PALIO DEI FUOCHI
// -------------------------------------------------------------------
// I fuochisti in gara e i rioni che rappresentano. Cambia ogni edizione.
// ===================================================================

// Palio dei Fuochi — i sei fuochisti e i rioni associati (XXVI Edizione)
const PALIO_FUOCHISTI = [
  // P.zza Cortemeola stava in `note`, cioè come frase sciolta sotto la scheda:
  // era l'unico rione a non essere una targhetta come tutti gli altri. Ora è
  // in `rioni` e si legge alla stessa maniera.
  { name: 'Di Matteo Fireworks Events s.a.s.', place: null, rioni: ['Via Botta', 'P.zza Cortemeola'] },
  { name: 'Colangelo Fireworks', place: null, rioni: ['Via Vittoria', 'Via Zambrano', 'Via Torello'] },
  { name: "L'Artificiosa s.a.s.", place: null, rioni: ['Palazzo – Chivano'] },
  { name: 'F.lli Romano', place: 'Angri (SA)', rioni: ['Via D’Andrea', 'Via E. & G. Russo', 'Via Pesce', 'Via XX Settembre', 'Via R. Di Filippo', 'Vicolo Corvino', 'Vicolo G. Albano', 'Via Calvanese', 'Via Papa Giovanni XXIII'] },
  { name: 'Spettacoli Pirotecnici Pepe', place: null, rioni: ['Ass. Terra Nostra', 'Ass. Amici del Fuoco', 'Via Marconi', 'Via Campo', 'Via Variante – “Vasc o Puzz”', 'Via Spinelli'] },
  { name: 'Emotion Fireworks', place: null, rioni: ['Casaleo – Olivitello'] },
];

module.exports = { PALIO_FUOCHISTI };
