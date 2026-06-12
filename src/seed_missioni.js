// Seed 100 missioni per FantaSanRocco
// Esegui con: node seed_missioni.js
require('dotenv').config();
const { db } = require('./src/db');

const missioni = [
  // ── SELFIE & FOTO CON PERSONE ─────────────────────────────────────────
  { title: 'Selfie con San Rocco', description: 'Fai un selfie davanti alla statua o all\'icona di San Rocco.', points: 15, requires_photo: 1 },
  { title: 'Foto con il parroco', description: 'Scatta una foto insieme al parroco durante la festa.', points: 25, requires_photo: 1 },
  { title: 'Selfie in gruppo con 5+ persone', description: 'Un selfie con almeno 5 persone tutte insieme — più siete meglio è!', points: 10, requires_photo: 1 },
  { title: 'Foto con la banda musicale', description: 'Cattura un momento con i musicisti della banda durante la processione o il concerto.', points: 15, requires_photo: 1 },
  { title: 'Selfie con un anziano del paese', description: 'Chiedi gentilmente a un nonno/nonna di Siano una foto ricordo.', points: 10, requires_photo: 1 },
  { title: 'Foto con il sindaco', description: 'Scatta una foto con il sindaco di Siano durante l\'evento.', points: 30, requires_photo: 1 },
  { title: 'Selfie con qualcuno che non hai mai visto prima', description: 'Presentati a uno sconosciuto e scattate una foto insieme.', points: 10, requires_photo: 1 },
  { title: 'Foto con tre generazioni', description: 'Una foto con un bambino, un adulto e un anziano insieme.', points: 20, requires_photo: 1 },
  { title: 'Selfie in costume tradizionale', description: 'Indossa o fatti fotografare con un abito/costume tipico campano.', points: 20, requires_photo: 1 },
  { title: 'Foto con lo staff organizzatore', description: 'Ringrazia (e fotografa) almeno 2 persone dello staff della festa.', points: 15, requires_photo: 1 },

  // ── LUOGHI DI SIANO ────────────────────────────────────────────────────
  { title: 'Foto al campanile', description: 'Scatta una bella foto al campanile della chiesa di Siano.', points: 10, requires_photo: 1 },
  { title: 'Foto in piazza principale', description: 'Immortala la piazza principale durante i festeggiamenti.', points: 5, requires_photo: 1 },
  { title: 'Foto panoramica su Siano', description: 'Trova un punto panoramico e fotografa il paese dall\'alto.', points: 20, requires_photo: 1 },
  { title: 'Foto al municipio', description: 'Scatta una foto davanti al comune di Siano.', points: 10, requires_photo: 1 },
  { title: 'Foto in un vicolo caratteristico', description: 'Trova e fotografa un vicolo tipico del centro storico.', points: 10, requires_photo: 1 },
  { title: 'Foto alla chiesa al tramonto', description: 'Cattura la chiesa di San Rocco durante l\'ora d\'oro del tramonto.', points: 25, requires_photo: 1 },
  { title: 'Foto davanti a un murale o affresco', description: 'Trova un dipinto murale o affresco caratteristico e fotografalo.', points: 15, requires_photo: 1 },
  { title: 'Foto alla fontana', description: 'Trova la fontana più bella del paese e scattaci una foto.', points: 10, requires_photo: 1 },
  { title: 'Foto con le luci della festa di notte', description: 'Notturna con le luminarie della festa accese.', points: 20, requires_photo: 1 },
  { title: 'Foto al presepe o alla cappella votiva', description: 'Trova e fotografa una cappella votiva o un presepe nel paese.', points: 15, requires_photo: 1 },

  // ── PROCESSIONE E RITI ────────────────────────────────────────────────
  { title: 'Partecipa alla processione', description: 'Cammina per almeno un tratto della processione di San Rocco. Foto come prova.', points: 25, requires_photo: 1 },
  { title: 'Foto del simulacro di San Rocco', description: 'Fotografia ravvicinata della statua di San Rocco portata in processione.', points: 15, requires_photo: 1 },
  { title: 'Foto dei portatori del simulacro', description: 'Scatta una foto alle persone che portano la statua durante la processione.', points: 15, requires_photo: 1 },
  { title: 'Foto dell\'incenso', description: 'Cattura il fumo dell\'incenso durante la funzione religiosa.', points: 15, requires_photo: 1 },
  { title: 'Foto dei fedeli in preghiera', description: 'Cattura (con rispetto) un momento di preghiera collettiva.', points: 10, requires_photo: 1 },

  // ── FUOCHI D'ARTIFICIO ────────────────────────────────────────────────
  { title: 'Foto dei fuochi d\'artificio', description: 'Cattura un\'esplosione di fuochi d\'artificio in una foto.', points: 20, requires_photo: 1 },
  { title: 'Selfie durante i fuochi', description: 'Selfie con i fuochi d\'artificio sullo sfondo.', points: 15, requires_photo: 1 },
  { title: 'Video dei fuochi (foto del video)', description: 'Registra almeno 30 secondi di fuochi d\'artificio e carica uno screenshot.', points: 15, requires_photo: 1 },
  { title: 'Foto dell\'alba dopo la festa', description: 'Sei rimasto sveglio tutta la notte? Fotografa l\'alba su Siano.', points: 30, requires_photo: 1 },

  // ── CIBO & BEVANDE ────────────────────────────────────────────────────
  { title: 'Foto con una zeppola', description: 'Hai trovato le zeppole fritte? Fotografale (o fotografati mentre le mangi!).', points: 5, requires_photo: 1 },
  { title: 'Foto con un panino alla salsiccia', description: 'Il classico della festa: salsiccia alla brace in un panino.', points: 5, requires_photo: 1 },
  { title: 'Foto con il limoncello', description: 'Brinda con un limoncello campano — foto ricordo!', points: 5, requires_photo: 1 },
  { title: 'Foto con un dolce tipico', description: 'Fotografa un dolce tradizionale campano trovato alla festa.', points: 5, requires_photo: 1 },
  { title: 'Foto del buffet / stand gastronomico', description: 'Immortala uno stand di cibo alla festa.', points: 5, requires_photo: 1 },
  { title: 'Foto con una pizza fritta', description: 'Hai trovato la pizza fritta? Mostrala!', points: 5, requires_photo: 1 },
  { title: 'Foto con taralli o mustaccioli', description: 'Fotografa questi dolcetti tipici della tradizione campana.', points: 5, requires_photo: 1 },
  { title: 'Cena in trattoria locale', description: 'Cena in un ristorante o trattoria di Siano durante i giorni della festa. Foto al piatto!', points: 15, requires_photo: 1 },
  { title: 'Foto con un\'anguria (cocomero)', description: 'Estate e festa = anguria! Trovane una e fotografala.', points: 5, requires_photo: 1 },
  { title: 'Foto con la birra artigianale', description: 'Trova una birra locale o artigianale campana e fotografala.', points: 5, requires_photo: 1 },

  // ── MUSICA & BALLO ────────────────────────────────────────────────────
  { title: 'Balla in piazza', description: 'Balla almeno una canzone durante la festa. Foto o video come prova!', points: 20, requires_photo: 1 },
  { title: 'Foto con il cantante/musicista', description: 'Selfie con chi si esibisce sul palco o con un musicista della banda.', points: 20, requires_photo: 1 },
  { title: 'Canta una canzone napoletana', description: 'Cantala davanti a qualcuno — fatti fotografare mentre canti!', points: 15, requires_photo: 1 },
  { title: 'Foto del palco principale', description: 'Scatta una foto al palco durante un\'esibizione.', points: 10, requires_photo: 1 },
  { title: 'Foto della folla che balla', description: 'Cattura l\'energia della gente che balla in piazza.', points: 10, requires_photo: 1 },

  // ── MISSIONI SOCIALI ──────────────────────────────────────────────────
  { title: 'Recluta un nuovo giocatore', description: 'Convinci qualcuno che non gioca a iscriversi a FantaSanRocco. Fatti fotografare insieme.', points: 30, requires_photo: 1 },
  { title: 'Aiuta uno sconosciuto', description: 'Fai qualcosa di gentile per uno sconosciuto (portare una borsa, dare indicazioni…). Foto come prova!', points: 20, requires_photo: 1 },
  { title: 'Raccolta rifiuti', description: 'Raccogli almeno 10 pezzi di spazzatura durante la festa. Foto del sacchetto pieno.', points: 25, requires_photo: 1 },
  { title: 'Fai ridere qualcuno', description: 'Racconta una barzelletta o fai qualcosa di divertente — fotografa la reazione!', points: 10, requires_photo: 1 },
  { title: 'Complimentati con lo staff', description: 'Vai dallo staff e ringraziali di persona. Foto con loro come ricordo.', points: 10, requires_photo: 1 },

  // ── MISSIONI CREATIVE ─────────────────────────────────────────────────
  { title: 'Foto artistica in bianco e nero', description: 'Scatta una foto in bianco e nero di qualsiasi soggetto della festa.', points: 15, requires_photo: 1 },
  { title: 'Foto "a tema rosso"', description: 'Scatta una foto dove il colore dominante è il rosso.', points: 10, requires_photo: 1 },
  { title: 'Selfie con ombra creativa', description: 'Gioca con la luce e cattura la tua ombra in modo creativo.', points: 10, requires_photo: 1 },
  { title: 'Foto di dettaglio (macro)', description: 'Fotografa un particolare minuscolo: un fiore, un gioiello, una moneta.', points: 10, requires_photo: 1 },
  { title: 'Foto "specchio d\'acqua"', description: 'Trova un riflesso sull\'acqua e fotografalo.', points: 15, requires_photo: 1 },
  { title: 'Disegna San Rocco', description: 'Fai un disegno (anche su carta) di San Rocco e fotografalo.', points: 20, requires_photo: 1 },
  { title: 'Scrivi "Viva San Rocco" da qualche parte', description: 'Scrivi la frase su carta/terreno/sabbia e fotografala.', points: 10, requires_photo: 1 },
  { title: 'Foto con effetto movimento (blur)', description: 'Fotografa qualcosa in movimento lasciando il mosso artistico.', points: 15, requires_photo: 1 },
  { title: 'Collage foto della giornata', description: 'Crea un collage di almeno 4 foto della festa e caricalo come singola immagine.', points: 20, requires_photo: 1 },
  { title: 'Foto "controluce"', description: 'Scatta una foto controluce (soggetto silhouette su sfondo luminoso).', points: 15, requires_photo: 1 },

  // ── SFIDE FISICHE ─────────────────────────────────────────────────────
  { title: 'Percorri tutta la via principale a piedi', description: 'Cammina per tutta la via principale di Siano dall\'inizio alla fine. Foto al punto di partenza e di arrivo.', points: 15, requires_photo: 1 },
  { title: 'Sali in cima al punto più alto raggiungibile', description: 'Trova il punto più elevato accessibile e fotografa il panorama.', points: 20, requires_photo: 1 },
  { title: 'Corri 1 km durante la festa', description: 'Fai una corsetta e fotografa la mappa/contapassi come prova.', points: 15, requires_photo: 1 },
  { title: 'Bevi 2 litri d\'acqua in giornata', description: 'Mantieniti idratato! Fotografa le bottiglie vuote come prova.', points: 10, requires_photo: 1, repeatable: 0 },
  { title: 'Rimani sveglio fino a mezzanotte', description: 'Foto con l\'orologio che mostra la mezzanotte in piazza.', points: 15, requires_photo: 1 },

  // ── MISSIONI "SIANO" SPECIFICHE ───────────────────────────────────────
  { title: 'Trova 5 insegne di negozi storici', description: 'Fotografa 5 insegne di negozi storici o artigiani del centro di Siano.', points: 20, requires_photo: 1 },
  { title: 'Chiedi a un locale la storia di San Rocco', description: 'Parla con un abitante di Siano e chiedi la storia del santo patrono. Foto con lui/lei.', points: 15, requires_photo: 1 },
  { title: 'Trova la targa stradale più antica', description: 'Cerca e fotografa la targa stradale più vecchia che riesci a trovare.', points: 10, requires_photo: 1 },
  { title: 'Foto con una macchina classica o d\'epoca', description: 'Trova e fotografa un\'auto o moto d\'epoca nel paese.', points: 10, requires_photo: 1 },
  { title: 'Foto dell\'ingresso del paese', description: 'Fotografa il cartello "Siano" all\'ingresso del comune.', points: 10, requires_photo: 1 },
  { title: 'Scopri una storia locale', description: 'Chiedi a qualcuno del posto una curiosità o leggenda locale. Scrivi la storia nella nota e fatti fotografare con il narratore.', points: 20, requires_photo: 1 },

  // ── NATURA & PAESAGGIO ────────────────────────────────────────────────
  { title: 'Foto di un tramonto da Siano', description: 'Cattura il tramonto dalla collina o dal centro storico.', points: 15, requires_photo: 1 },
  { title: 'Foto di un cielo stellato', description: 'Fotografa il cielo notturno durante la festa.', points: 20, requires_photo: 1 },
  { title: 'Foto di un\'ulivo secolare', description: 'Trova e fotografa un ulivo antico nel territorio.', points: 10, requires_photo: 1 },
  { title: 'Foto di un animale della zona', description: 'Fotografa un animale (gatto, cane, uccello, ecc.) incontrato durante la festa.', points: 5, requires_photo: 1 },
  { title: 'Foto di fiori selvatici', description: 'Trova e fotografa fiori selvatici nelle campagne intorno a Siano.', points: 10, requires_photo: 1 },
  { title: 'Foto panoramica sui monti Picentini', description: 'Fotografa i monti sullo sfondo del paese.', points: 15, requires_photo: 1 },

  // ── MISSIONI NOTTURNE ─────────────────────────────────────────────────
  { title: 'Selfie a mezzanotte in piazza', description: 'Foto con timestamp visibile che mostra mezzanotte in piazza principale.', points: 20, requires_photo: 1 },
  { title: 'Foto delle luminarie', description: 'Fotografa le luminarie della festa illuminate di notte.', points: 10, requires_photo: 1 },
  { title: 'Foto della luna sopra la chiesa', description: 'Cattura la luna piena (o quasi) sopra la chiesa di San Rocco.', points: 25, requires_photo: 1 },
  { title: 'Foto di Siano deserta di notte', description: 'Dopo la festa, fotografa un angolo del paese silenzioso e vuoto.', points: 15, requires_photo: 1 },

  // ── MISSIONI DI SQUADRA ───────────────────────────────────────────────
  { title: 'Foto di squadra (tutti i giocatori)', description: 'Riunisci più giocatori di FantaSanRocco e fotografatevi insieme.', points: 30, requires_photo: 1 },
  { title: 'Sfida un altro giocatore', description: 'Sfida un altro partecipante a chi completa più missioni in un\'ora. Foto come prova.', points: 20, requires_photo: 1 },
  { title: 'Gara di ballo con un altro giocatore', description: 'Balla in gara con un altro giocatore — foto della sfida.', points: 15, requires_photo: 1 },

  // ── MISSIONI BONUS ────────────────────────────────────────────────────
  { title: 'Primo ad arrivare alla festa', description: 'Sei il primo ad arrivare in piazza il giorno della festa? Foto dell\'orologio e della piazza semi-vuota.', points: 25, requires_photo: 1 },
  { title: 'Ultimi ad andarsene', description: 'Sei ancora lì quando spengono tutto? Foto dell\'orologio e della piazza che si svuota.', points: 25, requires_photo: 1 },
  { title: 'Foto del programma ufficiale della festa', description: 'Trova il depliant o il programma della festa e fotografalo.', points: 10, requires_photo: 1 },
  { title: 'Condividi la tua foto preferita della giornata', description: 'Carica la foto che consideri la più bella di tutta la giornata di festa.', points: 10, requires_photo: 1, repeatable: 0 },
  { title: 'Scrivi un messaggio a San Rocco', description: 'Scrivi un pensiero o una preghiera su un foglio e fotografalo davanti alla chiesa.', points: 10, requires_photo: 1 },
  { title: 'Trova tutti i simboli di San Rocco', description: 'Il cane, il bastone, la conchiglia, il mantello: fotografa un soggetto che li rappresenta tutti.', points: 30, requires_photo: 1 },
  { title: 'Scala la classifica: entra nella top 3', description: 'Arriva tra i primi 3 della classifica. Screenshot come prova.', points: 50, requires_photo: 1 },
  { title: 'Completa 10 missioni in un giorno', description: 'Prova di completare 10 missioni entro la giornata. Screenshot del tuo profilo come prova.', points: 40, requires_photo: 1 },
  { title: 'Racconta la tua giornata in 3 foto', description: 'Carica una mini-storia della tua giornata: mattina, pomeriggio, sera. Un collage delle 3 immagini.', points: 20, requires_photo: 1 },
  { title: 'Missione segreta: sorprendici!', description: 'Fai qualcosa di originale e creativo che non è nelle altre missioni. Spiegaci nella nota cosa hai fatto!', points: 35, requires_photo: 1 },
];

const insert = db.prepare(`
  INSERT INTO missions (title, description, points, requires_photo, repeatable)
  VALUES (@title, @description, @points, @requires_photo, @repeatable)
`);

const insertMany = db.transaction((list) => {
  for (const m of list) {
    insert.run({
      title: m.title,
      description: m.description,
      points: m.points,
      requires_photo: m.requires_photo ?? 1,
      repeatable: m.repeatable ?? 0,
    });
  }
});

const countBefore = db.prepare('SELECT COUNT(*) as n FROM missions').get().n;
insertMany(missioni);
const countAfter = db.prepare('SELECT COUNT(*) as n FROM missions').get().n;

console.log(`✅ Missioni aggiunte: ${countAfter - countBefore} (totale: ${countAfter})`);
