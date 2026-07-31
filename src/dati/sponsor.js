// ===================================================================
// FantaSanRocco — SPONSOR della barra
// -------------------------------------------------------------------
// Contenuto: l'elenco delle attivita' e il controllo di quali PNG sono
// gia' arrivati. Le istruzioni per preparare i loghi stanno in
// public/sponsor/LEGGIMI.txt.
// ===================================================================
const fs = require('fs');
const path = require('path');

// ── Muro sponsor: le attività che mettono i premi ─────────────────────────
// Le attività sono queste, i loghi arrivano alla spicciolata. Invece di
// tenere l'elenco a metà, lo teniamo intero e mostriamo solo le voci il cui
// PNG è già in public/sponsor/: appena il file arriva il logo entra nella
// barra da solo, senza toccare il codice. Il controllo si fa una volta
// all'avvio — la barra è in ogni pagina, non può costare un accesso al
// disco a ogni richiesta.
// L'ordine segue il foglio scritto a mano degli sponsor (prima colonna e poi
// seconda), così l'elenco si ricontrolla riga per riga contro l'originale.
// In fondo chi è arrivato dopo, e sul foglio non c'è.
const SPONSOR_ATTIVITA = [
  { file: 'romalba.png',             nome: 'Romalba' },
  { file: 'nemo.png',                nome: 'Nemo Restaurant Food & Wine' },
  { file: 'gym-hall.png',            nome: 'Gym Hall Muscle Zone' },
  { file: 'athena-fitness.png',      nome: 'Athena Fitness' },
  { file: 'fatima-leo.png',          nome: 'Fatima Leo Salon & Academy' },
  { file: 'day-by-day.png',          nome: 'Day by Day Multibrand Siano' },
  { file: 'medea.png',               nome: 'Centro Estetico Medea' },
  { file: 'telefonia-eredi-leo.png', nome: 'Telefonia Eredi Leo' },
  { file: 'cycling-botta.png',       nome: 'Cycling Botta' },
  { file: 'vitello-paesano.png',     nome: 'Al Vitello Paesano' },
  { file: 'bar-frasci-2-0.png',      nome: 'Bar V. Frasci 2.0' },
  { file: 'de-santis.png',           nome: 'De Santis' },
  { file: 'bellini-events.png',      nome: 'Bellini Events' },
  { file: 'babba-house.png',         nome: 'Babba House' },
  { file: 'bar-vittoria.png',        nome: 'Bar Vittoria' },
  { file: 'kalu.png',                nome: 'Kalù' },
  // Sul foglio era segnato solo "Claudio": il logo dice Claudio De Maio
  // Personal Trainer, e vale il marchio perché è il nome che finisce nell'alt.
  { file: 'claudiopersonal.png',     nome: 'Claudio De Maio Personal Trainer' },
  { file: 'luigi-fotografo.png',     nome: 'Luigi Fotografo' },
  { file: 'pizzeria-zio-mauro.png',  nome: 'Pizzeria Zio Mauro' },
  { file: 'pizzeria-frasci.png',     nome: 'Pizzeria V. Frasci' },
  { file: 'lamberti.png',            nome: 'Studio Dentistico Michele Lamberti' },
  { file: 'chalet.png',              nome: 'Chalet' },
  { file: 'revolution.png',          nome: 'Revolution' },
  // Sul foglio era segnata come "Zio Enrico", ma l'insegna e il logo dicono
  // Zanzibar: vale il marchio, perché è il nome che finisce nell'alt.
  { file: 'zio-enrico.png',          nome: 'Zanzibar Lounge Bar' },
  { file: 'bar-sport.png',           nome: 'Bar Sport' },
  { file: 'barberia-frasci.png',     nome: 'Barberia Frasci' },
  { file: 'marcello-frasci.png',     nome: 'Marcello Frasci' },
  { file: 'franzis.png',             nome: "Franzy's" },
  { file: 'pizzeria-walter.png',     nome: 'Pizzeria Walter' },
  { file: 'mauro-parrucchiere.png',  nome: 'Mauro Parrucchiere' },
  { file: 'bc-coffe.png',            nome: 'BC Coffe & More' },
  { file: 'parrucchiere-tony.png',   nome: 'Parrucchiere Tony' },
  { file: 'bar-ideal.png',           nome: 'Bar Ideal' },
  { file: 'gelateria-gerry.png',     nome: 'Gelateria Gerry' },
  { file: 'tabacchino.png',          nome: 'Tabacchino della Chiesa' },
  // ── Non sul foglio, arrivati dopo ──
  { file: 'target-communication.png', nome: 'Target Communication' },
  { file: 'di-filippo.png',          nome: 'Di Filippo Fotografi' },
];

const SPONSOR_LOGHI = (() => {
  const dir = path.join(__dirname, '..', '..', 'public', 'sponsor');
  const presenti = SPONSOR_ATTIVITA.filter((s) => fs.existsSync(path.join(dir, s.file)));
  // Finché non arriva nessun logo vero la barra gira col segnaposto, come
  // faceva prima: meglio il marchio della festa che una striscia vuota.
  if (!presenti.length) {
    return Array.from({ length: 6 }, () => ({ file: 'fantasanrocco.png', nome: 'FantaSanRocco' }));
  }
  return presenti;
})();

module.exports = { SPONSOR_ATTIVITA, SPONSOR_LOGHI };
