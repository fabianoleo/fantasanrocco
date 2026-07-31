// ===================================================================
// FantaSanRocco — I PREMI
// -------------------------------------------------------------------
// Contenuto, non logica: qui si cambia l'elenco dei premi senza aprire
// il file dove vivono l'anti-cheat e le rotte.
//
// Lo leggono in tre: la pagina /premio, la classifica e la home. Tenendo
// una copia sola non puo' succedere che la classifica prometta un premio
// e la pagina dei premi ne dica un altro.
// ===================================================================
const fs = require('fs');
const path = require('path');

// Radice del progetto. Da qui dentro servono DUE risalite (src/dati → src →
// radice): quando questo elenco stava in server.js ne bastava una, ed è
// l'errore che si fa spostando un file senza guardare i __dirname.
const RADICE = path.join(__dirname, '..', '..');

// ── I PREMI, uno per posizione ────────────────────────────────────────────
// Unico elenco: lo leggono la pagina /premio e la classifica. Tenendone una
// copia sola non può succedere che la classifica prometta un premio e la
// pagina dei premi ne dica un altro.
// Per cambiare l'ordine basta spostare le righe e correggere `pos`.
//
// I primi tre hanno la scheda grande (tagline + descrizione + foto), gli
// altri una card piccola. `foto` sono i file in public/images/premi/.
//
// `logo` è il file del marchio in public/sponsor/, lo stesso che gira nella
// barra sponsor. Si indica a mano e non si ricava da `offerto` per due
// motivi: i due nomi non coincidono sempre (sul foglio sponsor l'attività è
// "Al Vitello Paesano", nel premio "Vitello Paesano"), e ci sono marchi che
// vanno mostrati senza che l'attività offra il premio — il buono del 2º
// posto si spende da Nemo, ma non è il ristorante a metterlo in palio, e
// infatti quella scheda non ha `offerto`. Per questo il marchio porta con sé
// `logoNome`, il nome che finisce nell'alt dell'immagine.
// I file che non ci sono ancora restano indicati lo stesso: il logo compare
// da solo il giorno che il PNG arriva, senza rimettere mano a questo elenco.
const PREMI = [
  {
    pos: 1, nome: 'SmartBox — Vacanza in Europa', valore: '230 €', icona: 'globe',
    tagline: 'Due notti per due, dove volete voi',
    desc: 'Un cofanetto regalo con due notti e colazione per due persone, da scegliere '
        + 'fra 304 hotel a 3 e 4 stelle e B&B di charme in tutta Europa. '
        + 'Estate o inverno poco importa: la destinazione e il momento li decidete voi, '
        + 'e avete più di tre anni di tempo per farlo.',
    incluso: [
      '2 notti con colazione', 'Per 2 persone',
      'Hotel 3* e 4* o B&B di charme', '304 località in Europa',
      'Validità 39 mesi', 'Cofanetto regalo o e-Box',
    ],
    foto: ['smartbox-cover.webp', 'smartbox-destinazioni.webp'],
  },
  {
    // Niente `offerto`: la spa ospita, non mette lei il premio in palio,
    // quindi la scheda non dice "offerto da". Il logo si vede lo stesso — è
    // per questo che `logo` è separato da `offerto`.
    // spa.png sta in public/sponsor/ perché è lì che vivono i marchi, ma NON
    // è in SPONSOR_ATTIVITA: nel nastro degli sponsor non compare.
    pos: 2, nome: 'Percorso SPA', icona: 'sparkle',
    tagline: 'Una giornata per due, a rimettersi in sesto',
    desc: 'Percorso SPA al Virginia Resort per due persone: una giornata intera per '
        + 'riprendersi da una settimana passata a rincorrere missioni, fuochi e classifica.',
    logo: 'spa.png', logoNome: 'Virginia Resort',
  },
  {
    // Come sopra: il buono si spende da Nemo, ma non è il ristorante a
    // metterlo in palio.
    pos: 3, nome: 'Buono da 100 €', valore: '100 €', icona: 'glass',
    tagline: 'Cento euro da spendere a tavola',
    desc: 'Un buono da cento euro per il Nemo Restaurant Food & Wine di Salerno: '
        + 'cucina contemporanea di mare, pesce fresco e crudi, pasta fatta a mano. '
        + 'Il terzo posto si festeggia seduti, con chi vuoi tu.',
    logo: 'nemo.png', logoNome: 'Nemo Restaurant Food & Wine',
  },
  { pos: 4,  nome: '6 mesi di prova gratuita', offerto: 'Gym Hall Muscle Zone', icona: 'bolt',
    logo: 'gym-hall.png' },
  { pos: 5,  nome: '5 lezioni di personal training', offerto: 'Athena Fitness', icona: 'target',
    nota: 'Con il personal trainer Claudio De Maio',
    logo: 'athena-fitness.png' },
  { pos: 6,  nome: 'Friggitrice ad aria', offerto: 'Telefonia Eredi Leo', icona: 'flame',
    logo: 'telefonia-eredi-leo.png' },
  { pos: 7,  nome: 'Buono trattamento', offerto: 'Fatima Leo Salon & Academy', valore: '50 €', icona: 'candle',
    nota: 'Valido un anno', logo: 'fatima-leo.png' },
  { pos: 8,  nome: 'Buono spesa', offerto: 'Day by Day Multibrand Siano', valore: '50 €', icona: 'ticket',
    logo: 'day-by-day.png' },
  { pos: 9,  nome: 'Buono', offerto: 'Alfonso Cerrato', valore: '30 €', icona: 'gift',
    logo: 'alfocerrato.png' },
  { pos: 10, nome: 'Buono 3 lampade', offerto: 'Centro Estetico Medea', icona: 'sun',
    logo: 'medea.png' },

  // ── Gli ultimi tre non si vincono in classifica generale ────────────────
  // Due vanno a chi comanda le classifiche dei mini-giochi, che sono una gara
  // separata: hanno `gioco` invece di `pos`.
  { gioco: 'runner', nome: 'Buono Cicli Botti', offerto: 'Cycling Botta', valore: '30 €', icona: 'bike',
    nota: 'Vendita e riparazione bici a Siano dal 1923',
    logo: 'cycling-botta.png' },
  { gioco: 'jetpack', nome: 'Buono panino e bibita', offerto: 'BC Coffe & More', valore: '30 €', icona: 'coffee',
    logo: 'bc-coffe.png' },

  // E uno non si vince nemmeno giocando qui: è del Torneo delle Missioni su
  // Instagram, che è una gara a parte con regole sue. Ha `torneo` al posto di
  // `pos` e di `gioco` — tre categorie diverse perché sono tre gare diverse,
  // e mescolarle in classifica prometterebbe a qualcuno un premio che non può
  // vincere restando sul sito.
  { torneo: 'instagram', nome: 'Buono premio', offerto: 'Al Vitello Paesano', valore: '20 €', icona: 'instagram',
    nota: 'Al vincitore del Torneo delle Missioni su Instagram',
    logo: 'vitello-paesano.png', logoNome: 'Al Vitello Paesano' },
];


// Il marchio si mostra solo se il PNG c'è davvero, come per la barra sponsor:
// un logo annunciato ma non ancora arrivato diventerebbe un'immagine rotta
// sulla pagina dei premi. Il controllo si fa una volta sola all'avvio, e
// scrive `logoSrc` sul premio — la pagina si limita a leggerlo.
for (const p of PREMI) {
  if (p.logo && fs.existsSync(path.join(RADICE, 'public', 'sponsor', p.logo))) {
    p.logoSrc = `/sponsor/${p.logo}`;
    p.logoNome = p.logoNome || p.offerto || p.nome;
  }
}

// Come si chiamano i due giochi, per le etichette. La chiave è la stessa che
// usa game_runs, così non ci sono due vocabolari per la stessa cosa.
const NOMI_GIOCHI = { runner: 'Corri San Rocco', jetpack: 'San Rocco Jetpack' };

const PREMI_PODIO = PREMI.filter((p) => p.pos && p.pos <= 3);
const PREMI_LISTA = PREMI.filter((p) => p.pos && p.pos > 3);
const PREMI_GIOCHI = PREMI.filter((p) => p.gioco);
// Terza categoria: i premi che non si vincono nè in classifica nè giocando
// qui, ma in gare che vivono fuori dal sito (per ora il Torneo delle Missioni
// su Instagram). Tenerli separati serve a non prometterli a chi guarda la
// classifica: da lì non si raggiungono.
const PREMI_TORNEI = PREMI.filter((p) => p.torneo);
// Fin dove arriva la classifica generale a premiare: si ricava dall'elenco,
// così aggiungendo un premio non resta una soglia scritta a mano da qualche
// altra parte che dice un numero diverso.
const ULTIMA_POSIZIONE_PREMIATA = Math.max(...PREMI.filter((p) => p.pos).map((p) => p.pos));

// Indicizzati per posizione: la classifica deve poter chiedere "che premio
// c'è al 7º posto?" senza scorrere l'elenco a ogni riga.
// Solo i premi legati a una posizione: quelli dei giochi non hanno un `pos`,
// e senza il filtro finirebbero tutti sotto la chiave `undefined`.
const PREMIO_PER_POSIZIONE = Object.fromEntries(PREMI.filter((p) => p.pos).map((p) => [p.pos, p]));
// Indicizzati per gioco, per le due sotto-classifiche dei mini-giochi.
const PREMIO_PER_GIOCO = Object.fromEntries(PREMI_GIOCHI.map((p) => [p.gioco, p]));

module.exports = {
  PREMI,
  PREMI_PODIO,
  PREMI_LISTA,
  PREMI_TORNEI,
  PREMI_GIOCHI,
  PREMIO_PER_POSIZIONE,
  PREMIO_PER_GIOCO,
  NOMI_GIOCHI,
  ULTIMA_POSIZIONE_PREMIATA,
};
