// ===================================================================
// FantaSanRocco — I PRONOSTICI a risposta chiusa
// -------------------------------------------------------------------
// Funzionano come il Pronostico del Palio: si sceglie fra opzioni fisse,
// lo staff dichiara la risposta giusta e i punti si accreditano da soli
// a chi ha indovinato. Non sono missioni e non chiedono foto.
//
// Per cambiarne uno si tocca SOLO questo file, poi si lancia
//   node strumenti/patch_pronostici.js
// che porta il database sopra questo elenco senza perdere i voti già dati.
//
// LA RISPOSTA GIUSTA NON STA QUI, E NON DEVE FINIRCI MAI. Questo
// repository è pubblico: bastano cinque righe scritte qui per regalare
// 500 punti a chiunque sappia aprire GitHub, e il pronostico smette di
// essere un pronostico.
// Le risposte le dichiara lo staff dal pannello, sera per sera, dopo che
// la serata è cominciata. Se qualcuno te le passa in anticipo, tienile
// fuori dal codice: qui dentro ci sta solo l'ELENCO fra cui scegliere.
// ===================================================================

// I colori fra cui si sceglie. Sono una scelta: prima il colore si
// scriveva a mano nella nota per lo staff, e chi rispondeva "verde
// bottiglia" contro "verde" apriva una discussione ogni sera. Con le
// opzioni fisse la risposta o c'è o non c'è, e i punti li dà il server.
// Se Alfonso si presenta con un colore che non è in elenco, l'elenco si
// allarga qui e si rilancia lo script.
// In ORDINE ALFABETICO, non per probabilità: un elenco che mette per primi i
// colori "giusti" è già mezzo suggerimento. Alfabetico non dice niente a
// nessuno ed è anche più facile da scorrere.
// «Black & White» è in elenco perché un completo bicolore non è né bianco né
// nero, e senza questa voce chi lo indovina non avrebbe dove cliccare.
const COLORI = [
  'Beige', 'Bianco', 'Black & White', 'Blu', 'Fantasia',
  'Giallo', 'Grigio', 'Marrone', 'Nero', 'Rosso', 'Verde',
];

// Il pronostico della sera N apre alle 18 del giorno prima e chiude alle
// 18 della sera stessa: dopo, l'outfit lo hanno visto tutti.
const CHIUDE = (n) => `2026-08-${String(n).padStart(2, '0')} 18:00:00`;

const PRONOSTICI = [14, 15, 16, 17, 18].map((g) => ({
  // Il titolo è la chiave con cui lo script ritrova il pronostico nel
  // database: cambiarlo crea un doppione invece di correggere quello che c'è.
  title: `«Oltre» i colori · ${g} agosto`,
  description:
    'Di che colore sarà l’outfit di Alfonso Leo stasera? Scegli un colore: '
    + 'si chiude alle 18, prima che cominci la serata. Chi indovina prende i punti.',
  options: COLORI,
  points: 100,
  multi: 0,          // una risposta sola: con più risposte i punti si dimezzano
  closes_at: CHIUDE(g),
}));

module.exports = { PRONOSTICI, COLORI };
