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
    pos: 1, nome: 'Box viaggi', valore: '250 €', icona: 'globe',
    tagline: 'Il premio più grande della festa',
    desc: 'Un cofanetto viaggi da 250 euro. La destinazione e il momento li scegli tu: '
        + 'chi chiude la festa in cima alla classifica parte.',
    foto: ['smartbox-cover.webp', 'smartbox-destinazioni.webp'],
  },
  {
    // Niente `offerto`, come per il Percorso Spa: la cena si fa da Nemo, ma
    // non è il ristorante a metterla in palio.
    pos: 2, nome: 'Cena da Nemo', valore: '100 €', icona: 'glass',
    tagline: 'Cento euro da spendere a tavola',
    desc: 'Un buono da cento euro per il Nemo Restaurant Food & Wine di Salerno: '
        + 'cucina contemporanea di mare, pesce fresco e crudi, pasta fatta a mano. '
        + 'Il secondo posto si festeggia seduti, con chi vuoi tu.',
    logo: 'nemo.png', logoNome: 'Nemo Restaurant Food & Wine',
  },
  {
    // Niente `offerto`: il percorso si fa da The Spa, ma non è la struttura
    // a metterlo in palio, quindi la scheda non deve dire "offerto da".
    pos: 3, nome: 'Percorso Spa', valore: '60–80 €', icona: 'sparkle',
    tagline: 'Relax in pausa, tre ore per rimettersi in sesto',
    desc: 'Il Percorso Spa di The Spa, al San Severino Park Hotel & Spa: tre ore per rimettersi '
        + 'da una settimana passata a rincorrere missioni, fuochi e classifica. '
        + 'Valido dal lunedì al giovedì feriali, esclusi i prefestivi.',
    // Le tappe del percorso: sul podio diventano una griglia di etichette.
    incluso: [
      'Sauna', 'Biosauna', 'Bagno turco', 'Cabina della neve',
      'Docce emozionali', 'Cascata del ghiaccio',
      'Piscina con docce cervicali e idromassaggio',
      'Piscina di deprivazione sensoriale', 'Percorso Kneipp',
      'Stanza del silenzio con parete di sale',
      'Salotto relax con angolo tisaneria',
      'Kit con accappatoio, telo e infradito',
    ],
  },
  { pos: 4,  nome: '6 mesi di prove gratuite', offerto: 'Gym Hall Muscle Zone', icona: 'bolt',
    logo: 'gym-hall.png' },
  { pos: 5,  nome: '5 lezioni di personal training', offerto: 'Athena Fitness', icona: 'target',
    nota: 'Con il personal trainer Claudio De Maio',
    logo: 'athena-fitness.png' },
  { pos: 6,  nome: 'Trattamento', offerto: 'Fatima Leo Salon & Academy', valore: '50 €', icona: 'candle',
    logo: 'fatima-leo.png' },
  { pos: 7,  nome: 'Buono spesa', offerto: 'Day by Day Multibrand Siano', valore: '50 €', icona: 'ticket',
    logo: 'day-by-day.png' },
  // Senza `valore`: erano cinque lampade da 50 €, ora sono tre e quanto valgano
  // non l'ha detto nessuno. Meglio non scrivere niente che scrivere una cifra
  // sbagliata su un premio vero. La scheda regge: il valore è facoltativo.
  { pos: 8,  nome: '3 lampade',   offerto: 'Centro Estetico Medea', icona: 'sun',
    logo: 'medea.png' },
  { pos: 9,  nome: 'Friggitrice ad aria', offerto: 'Telefonia Eredi Leo', valore: '40–50 €', icona: 'flame',
    logo: 'telefonia-eredi-leo.png' },
  { pos: 10, nome: 'Macchinetta del caffè',  icona: 'coffee', foto: ['caffe.webp'] },
  // ── Gli ultimi due non si vincono in classifica generale ────────────────
  // Vanno a chi comanda le classifiche dei due mini-giochi. Hanno `gioco` al
  // posto di `pos`: è la differenza che tiene separate le due gare, perché
  // i record dei giochi sono una classifica a parte e non danno punti diretti.
  { gioco: 'runner', nome: 'Buono acquisto', offerto: 'Cycling Botta', valore: '30 €', icona: 'bike',
    nota: 'Vendita e riparazione bici a Siano dal 1923',
    logo: 'cycling-botta.png' },
  // "Buono macelleria" e non "Buono" liscio: accanto al nickname si vede solo
  // il nome del premio, e ci sono già un "Buono spesa" e un "Buono acquisto" —
  // un terzo "Buono" non direbbe nulla.
  { gioco: 'jetpack', nome: 'Buono macelleria', offerto: 'Vitello Paesano', valore: '30 €', icona: 'ticket',
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
  PREMI_GIOCHI,
  PREMIO_PER_POSIZIONE,
  PREMIO_PER_GIOCO,
  NOMI_GIOCHI,
  ULTIMA_POSIZIONE_PREMIATA,
};
