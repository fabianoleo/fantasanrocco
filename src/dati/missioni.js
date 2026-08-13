// ===================================================================
// FantaSanRocco — L'ELENCO DEFINITIVO DELLE MISSIONI
// -------------------------------------------------------------------
// Questa è l'unica lista che conta. La leggono in due:
//
//   strumenti/seed_missioni_2026.js   cancella tutto e ricrea da qui
//                                     (⚠️ si porta via anche le prove)
//   strumenti/patch_missioni.js       allinea il database a questa lista
//                                     SENZA perdere le prove già inviate
//
// Per cambiare una missione si tocca SOLO questo file: aggiungere, togliere
// o correggere una riga qui basta, e al lancio successivo il database si
// adegua da solo. Non esiste più un elenco di correzioni da tenere
// aggiornato a parte.
//
// Rarità → punti:  ⚪ Comune 25 · 🟢 Non comune 50 · 🔵 Rara 100 ·
//                  🟣 Epica 250 · 🟠 Leggendaria 500
// ===================================================================

const PTS = { comune: 25, 'non-comune': 50, rara: 100, epica: 250, leggendaria: 500 };
const EMOJI = { comune: '⚪', 'non-comune': '🟢', rara: '🔵', epica: '🟣', leggendaria: '🟠' };

// Finestre "giorno festa" per le sfide giornaliere (ora italiana; il server le
// interpreta come Europe/Rome). Ogni sfida è visibile solo nel suo giorno.
// LE SFIDE GIORNALIERE SI ACCENDONO ALLE 18:00 della loro sera e si spengono
// alle 18:00 del giorno dopo. Ventiquattro ore che cominciano quando comincia
// la serata, non a mezzanotte: la sfida esce insieme alla festa, e chi torna a
// casa alle tre del mattino ha ancora tutto il giorno dopo per mandare la prova.
//
// Il 12 fa eccezione perche' era gia' partito a mezzanotte: si chiude alle 18
// del 13 come annunciato, ma l'inizio resta quello vero.
const DAY = {
  12: ['2026-08-12 00:00:00', '2026-08-13 18:00:00'],
  13: ['2026-08-13 18:00:00', '2026-08-14 18:00:00'],
  14: ['2026-08-14 18:00:00', '2026-08-15 18:00:00'],
  15: ['2026-08-15 18:00:00', '2026-08-16 18:00:00'],
  16: ['2026-08-16 18:00:00', '2026-08-17 18:00:00'],
  17: ['2026-08-17 18:00:00', '2026-08-18 18:00:00'],
  18: ['2026-08-18 18:00:00', '2026-08-19 18:00:00'],
};

// GIORNATA PIENA: apre a mezzanotte invece che alle 18. La usano SOLO le
// missioni FLASH, e non e' una preferenza sull'orario: quelle le accende lo
// staff nel momento in cui la cosa succede, e una finestra che parte alle 18
// terrebbe nascosta la missione anche dopo che qualcuno ha premuto il
// pulsante. Peppe Tap Tap passa quando passa, non alle 18 in punto.
//
// Le altre missioni del giorno si accendono tutte alle 18, comprese quelle
// che si fanno di giorno: la prova si puo' mandare anche dopo, nessun
// controllo rifiuta una foto scattata prima dell'apertura.
const DAY_PIENO = {
  12: ['2026-08-12 00:00:00', '2026-08-13 18:00:00'],
  13: ['2026-08-13 00:00:00', '2026-08-14 18:00:00'],
  14: ['2026-08-14 00:00:00', '2026-08-15 18:00:00'],
  15: ['2026-08-15 00:00:00', '2026-08-16 18:00:00'],
  16: ['2026-08-16 00:00:00', '2026-08-17 18:00:00'],
  17: ['2026-08-17 00:00:00', '2026-08-18 18:00:00'],
  18: ['2026-08-18 00:00:00', '2026-08-19 18:00:00'],
};

// Finestra di un PRONOSTICO: apre alle 18 del giorno prima e chiude alle 18
// del giorno stesso, cioè PRIMA che la sera cominci. È la parte che rende il
// gioco un gioco: se restasse aperta dopo, si potrebbe rispondere avendo già
// visto. Deve restare identica a quella in patch_missioni.js.
const PRONOSTICO = (n) => [
  `2026-08-${String(n - 1).padStart(2, '0')} 18:00:00`,
  `2026-08-${String(n).padStart(2, '0')} 18:00:00`,
];

// Finestra che copre più giorni, per le missioni che non stanno in uno solo.
// Finestra su misura, stessa regola del DAY qui sopra: si chiude alle 18:00
// del giorno dopo l'ultimo, non a mezzanotte.
const DAL_AL = (da, a) => [`2026-08-${da} 00:00:00`, `2026-08-${String(Number(a) + 1).padStart(2, '0')} 18:00:00`];

// m(nome, descrizione, rarità, opzioni)
// opzioni: { rep: ripetibile più volte al giorno, day: N sfida giornaliera,
//            flash: true → creata NASCOSTA (la attivi tu quando parte il flash),
//            photo: false → non richiede foto (es. parola segreta),
//            win: [da, a] finestra su misura invece del singolo giorno,
//            giorni: '13,14,15,17' giorni ammessi dentro la finestra, per le
//                    missioni valide a giorni alterni }
function m(name, desc, rar, opt = {}) {
  return { name, desc, rar, ...opt };
}

const MISSIONS = [
  // ── PAESE & TRADIZIONE (15) ──────────────────────────────────────
  // Le foto CON una persona che nella processione ha un ruolo (sindaco,
  // parroco, banda) portano la stessa avvertenza: in quel momento stanno
  // lavorando, e fermarli per un selfie e' fuori luogo. Le missioni che
  // invece si fanno APPOSTA durante la processione (Il Portatore, In
  // Cammino, Momento Solenne) non la hanno, ovviamente.
  m('Primo Cittadino', 'Scatta una foto con il Sindaco di Siano. Non durante la processione.', 'rara', { sec: 'paese' }),
  m('Cantiere', 'Scatta una foto di un anziano che critica un lavoro pubblico.', 'non-comune', { sec: 'paese' }),
  m('Asso di Mazze', 'Scatta una foto di una partita a carte davanti alla Chiesa.', 'comune', { sec: 'paese' }),
  m('Fuori Orario', 'Scatta un selfie davanti a un bar dopo la chiusura. Deve vedersi la tua faccia, non solo il bar.', 'comune', { sec: 'paese' }),
  m("E' Tiemp Bell...", 'Pubblica una foto anni ’80 sul gruppo Facebook del paese (Sei di Siano se…). Come prova invia lo screenshot del post.', 'non-comune', { sec: 'paese' }),
  m("Ngopp a' Cappell", 'Scatta una foto panoramica del paese.', 'non-comune', { sec: 'paese' }),
  m("Annanz' a Chies", 'Scatta una foto sulle scale della chiesa.', 'comune', { sec: 'paese' }),
  m('Benvenuti a Siano', 'Scatta una foto davanti alla scritta con una posa creativa.', 'non-comune', { sec: 'paese' }),
  m('Colazione dei Campioni', 'Fai colazione FUORI CASA — al bar o comunque in giro — con i vestiti della sera prima, e scatta una foto.', 'non-comune', { sec: 'paese' }),
  m('Quattro Frecce', 'Scatta una foto di un parcheggio creativo (targa oscurata).', 'comune', { sec: 'paese' }),
  m('Il Pacco', 'Scatta una foto con il postino o corriere.', 'non-comune', { sec: 'paese' }),
  m("A' Machina Zozzosa", 'Scatta una foto ad un’auto impolverata sulla quale sia stata scritta la parola "FantaSanRocco".', 'rara', { sec: 'paese' }),
  m('A Per', 'Spostati con un mezzo alternativo e scatta una foto.', 'rara', { sec: 'paese' }),
  m('Tradizione', 'Impara una tradizione da un anziano e documentalo con una foto.', 'rara', { sec: 'paese' }),
  m('È sempre San Valentino da Romalba', 'Scatta una foto del mazzo di fiori comprato da Romalba per il/la tuo/a partner.', 'rara', { sec: 'paese', sponsor: 'romalba.png' }),

  // ── FOOD & DRINK (8) ─────────────────────────────────────────────
  m('Leccucci', 'Scatta una foto con il sacchetto di caramelle comprato alle bancarelle.', 'comune', { sec: 'food' }),
  m("A' Braciol e' Capr", 'Scatta una foto del piatto tipico sianese.', 'comune', { sec: 'food' }),
  m("O' Vin ca Percoc e Nu…", 'Scatta una foto del famoso "vino con la percoca".', 'comune', { sec: 'food' }),
  m('Lo Zio di Siano', 'Scatta una foto mentre bevi con Zio Max.', 'rara', { sec: 'food' }),
  m("O' Mast", 'Scatta una foto mentre bevi con il proprietario di un bar.', 'rara', { sec: 'food' }),
  m("Ngopp o' Pont", 'Scatta una foto con il paninaro di "ngopp o’ pont".', 'rara', { sec: 'food' }),
  m('Fila Infinita', 'Scatta una foto mentre sei in una lunga fila al bar.', 'non-comune', { sec: 'food' }),
  m('Vittoria', 'Scatta una foto della colazione o dell’aperitivo al bar Vittoria.', 'non-comune', { sec: 'food', sponsor: 'bar-vittoria.png' }),

  // ── SOCIAL & PARTY (16) ──────────────────────────────────────────
  m('Rocco', 'Scatta una foto con una persona di nome Rocco.', 'non-comune', { rep: true, sec: 'social' }),
  m('Kiss Kiss', 'Scatta una foto mentre dai baci durante la festa.', 'comune', { rep: true, sec: 'social' }),
  m('Spia', 'Scatta una foto mentre qualcuno compie uno dei tre malus: bere acqua, piangere o litigare.', 'epica', { rep: true, sec: 'social' }),
  m("Miettc a' Man Toji", 'Scatta un selfie in chiesa con la statua di un Santo.', 'non-comune', { sec: 'social' }),
  m('Trash Royale', 'Pubblica una storia Instagram volutamente trash sul tuo profilo pubblico taggando @fanta_sanrocco. Come prova invia lo screenshot della storia.', 'rara', { sec: 'social' }),
  m('Maracaibo', 'Entra in un trenino umano che balla e scatta una foto.', 'non-comune', { sec: 'social' }),
  m('Mangiata', 'Scatta un selfie durante una mangiata sulla terra.', 'epica', { sec: 'social' }),
  m('On Air', 'Fatti intervistare dal team del FantaSanRocco. Valgono solo le interviste fatte da noi: le riprese di altri non contano.', 'epica', { sec: 'social' }),
  m('Pigiama Party', 'Scatta una foto in pigiama davanti la chiesa.', 'epica', { sec: 'social' }),
  m('Cover', 'Ricrea una famosa foto di gruppo (es. "L’Ultima Cena" o una copertina iconica) con gli amici.', 'rara', { sec: 'social' }),
  m('Glitch', 'Trova due persone vestite uguali e fai una foto con entrambe.', 'rara', { sec: 'social' }),
  m('Facciamo i Seri', 'Scatta una foto in cui NESSUNO ride.', 'comune', { sec: 'social' }),
  m('Calici in Alto', 'Scatta una foto in cui tutti alzano i bicchieri.', 'comune', { sec: 'social' }),
  m('Cecchino', 'Scatta una foto con il pupazzo vinto sparando alle lattine.', 'non-comune', { sec: 'social' }),
  m("Nu Gir Ngopp a Giostr", 'Scatta una foto mentre fai un giro su una giostra presente alla festa.', 'comune', { sec: 'social' }),
  // Epica come Pigiama Party: il costume ad agosto te lo devi procurare, e qui
  // in più c'è da offrire da bere. La foto deve mostrare tutte e due le cose,
  // altrimenti resta un travestimento e basta.
  m('Missione Gnak Gnak', 'Vestiti da Babbo Natale, offri un drink a qualcuno e scatta una foto del brindisi.', 'epica', { sec: 'social' }),

  // ── SPORT, TEAM & COMUNITÀ (9) ───────────────────────────────────
  m('Partitella', 'Scatta una foto durante una partita con il pallone in piazza.', 'non-comune', { sec: 'sport' }),
  m('Ultras', 'Scatta una foto indossando la maglia di una squadra di calcio del paese.', 'non-comune', { sec: 'sport' }),
  m('San Rocco in campo', 'Fai una foto con il presidente della San Rocco Calcio Michele Marino.', 'non-comune', { sec: 'sport', sponsor: 'sanroccocalcio.png' }),
  m('Man of the Match', 'Scatta una foto con i calciatori delle squadre locali.', 'non-comune', { sec: 'sport' }),
  m('Meet the Team', 'Scatta una foto con uno dei membri del team "Fanta San Rocco".', 'rara', { rep: true, sec: 'sport' }),
  m('Benedizione', 'Scatta una foto con il parroco. Non durante la processione.', 'rara', { sec: 'sport' }),
  m('Nu Lumin a Sant Rocc', 'Accendi un lumino in chiesa lasciando un’offerta e scatta una foto.', 'non-comune', { sec: 'sport' }),
  m("Cuore d'Oro", 'Compi un gesto di beneficenza per il Malawi e documentalo con una foto. Puoi donare qui: https://www.orizzontemalawi.org/', 'leggendaria', { sec: 'sport' }),
  m('Musica Maestro', 'Scatta un selfie con la banda musicale. Non durante la processione, mentre stanno suonando.', 'rara', { sec: 'sport' }),

  // ── AGGIUNTE DEL 1º E 3 AGOSTO 2026 ──────────────────────────────
  // Divise per tema come tutte le altre. Due portano il marchio di chi le
  // mette (colonna `sponsor`): il logo compare sulla card della missione.
  m('BE REAL (Sianese)', 'Fai una foto con il presidente della Real Sianese Michele Lamberti.', 'non-comune', { sec: 'sport', sponsor: 'realsianese.png' }),
  m('Corri Forrest', 'Fai una foto mentre pratichi attività fisica all’aperto.', 'rara', { sec: 'sport' }),
  m('Green days', 'Fai una foto mentre ripulisci le strade (+10 punti bonus se pulisci con uno spazzino).', 'comune', { sec: 'sport' }),
  m('Ps. : I love me', 'Fai una foto mentre compri dei fiori per te stessa/o da Vastola.', 'rara', { sec: 'paese', sponsor: 'vastola.png' }),
  m('Piazza deserta', 'Fai una foto della piazza principale del paese completamente vuota durante la settimana di festa.', 'non-comune', { sec: 'paese' }),
  m('Banana Giò', 'Fai una foto con Giovanni Riccio e la banana gonfiabile all’Atelier di frutta e verdura.', 'rara', { sec: 'paese', sponsor: 'atelierfruttaeverdura.png' }),
  m('Spesa folle', 'Fai una foto mentre fai la spesa in abiti "folli" (elegante, in costume, maschera e boccaglio ecc.).', 'epica', { sec: 'food' }),
  m('Babbà House', 'Fai una foto a una Peroni con il campanile sullo sfondo.', 'non-comune', { sec: 'food', sponsor: 'babba-house.png' }),
  // Creata dal pannello durante la festa e riportata qui, altrimenti la patch
  // la considerava "non in elenco" e la nascondeva — con cinque prove gia'
  // fatte. Lo spazio davanti al nome NON e' un errore di battitura: il titolo
  // nel database e' "🟢  ‘nda kalu" con due spazi, e il nome deve ricostruirlo
  // esatto, altrimenti la patch ne crea una nuova e archivia questa.
  m(' ‘nda kalu', 'Fai una foto mentre brindi da kalù', 'non-comune', { sec: 'food', sponsor: 'kalu.png' }),
  // Il bonus dei +10 punti lo aggiunge lo staff in moderazione: qui si dice
  // solo che c'è, perché è la descrizione a fare la promessa.
  m('Moltiplicatore di Rocchi', 'Fai una foto con almeno 7 persone di nome "Rocco" (+10 punti bonus se c’è un cane).', 'leggendaria', { sec: 'social' }),
  m('Gemelli diversi', 'Fai una foto con un tuo omonimo (che ha il tuo stesso nome e cognome).', 'epica', { sec: 'social' }),
  // Senza foto: la prova è il link, e si incolla nella nota per lo staff.
  // ── AGGIUNTE DEL 13 AGOSTO ───────────────────────────────────────
  // Tutte generali (valgono tutti i giorni) e NON ripetibili: una al giorno,
  // come le altre. I bonus in coda alla descrizione li aggiunge lo staff in
  // moderazione, come per Green days e Moltiplicatore di Rocchi.
  m('Tamberi', 'Fatti una foto davanti alla chiesa con la barba fatta a metà, come Gianmarco Tamberi. Per le donne, e per chi la barba non ce l’ha: taglia qualche centimetro di capelli da un lato solo, ma che si veda.', 'epica', { sec: 'social' }),
  m('Mezzo e Mezzo', 'Tingiti i capelli metà di un colore e metà di un altro, poi scatta la foto. +50 punti bonus se uno dei due colori è il verde o l’oro del FantaSanRocco.', 'leggendaria', { sec: 'social' }),
  m('Sempre Pronti', 'Fatti una foto con un volontario della Protezione Civile di Siano in divisa. +10 punti bonus se la divisa è blu.', 'non-comune', { sec: 'sport' }),
  m('Brindisi col Team', 'Bevi qualcosa insieme a un membro del team FantaSanRocco e scatta la foto del brindisi.', 'rara', { sec: 'food' }),
  // Apostrofo dritto e minuscola come le altre in napoletano del file
  // ("A' Machina Zozzosa", "Ngopp a' Cappell"): il nome e' quello che si dice
  // in paese, non la sua traduzione.
  m("'o melon e fuoc", 'Fatti un selfie con almeno 5 persone calve, tutte nella stessa foto.', 'epica', { sec: 'social' }),
  // La prova e' lo screenshot della storia, come per Trash Royale e Corri su
  // TikTok: la foto in se' non direbbe se e' stata pubblicata davvero.
  // Le due condizioni che la fanno fallire stanno scritte, e per una ragione:
  // e' un video di gruppo, se il moderatore la rifiuta senza che fosse detto
  // prima si rifa' tutto da capo con dieci persone.
  m('Ritorna al Passato', 'Fatti un selfie con un orologio da taschino.', 'rara', { sec: 'paese' }),
  m('Motori del Passato', 'Fatti una foto all’interno di una macchina d’epoca.', 'rara', { sec: 'paese' }),
  m('Tre Ruote', 'Fatti una foto a bordo di un apecar.', 'rara', { sec: 'paese' }),
  m('In Vespa', 'Fatti una foto in sella a una Vespa.', 'rara', { sec: 'paese' }),
  m('Mannequin Challenge', 'Fate la mannequin challenge davanti alla chiesa: tutti immobili e la ripresa deve prendere tutta la piazza. Basta una persona o un oggetto in movimento e la prova non vale. Pubblica il video nelle storie taggando @fanta_sanrocco con il tag ben visibile, e come prova invia lo screenshot della storia.', 'epica', { sec: 'social' }),

  // ATTENZIONE: su TikTok il nome e' @fantasanrocco, senza trattino basso —
  // su Instagram invece e' @fanta_sanrocco. Sono due profili diversi, non e'
  // un refuso: vedi il pie' di pagina in views/layout.ejs.
  m('Corri su TikTok', 'Realizza un TikTok con il suono «Corri San Rocco» e incolla il link nella «nota per lo staff». Attenzione: il profilo deve essere pubblico e ricordati di taggare @fantasanrocco.', 'epica', { sec: 'social', photo: false }),

  // ── L'ADESIVO, UNA SERA PER OGNI BAR ─────────────────────────────
  // Il 16 e il 18 non c'è nessun bar: sono due buchi voluti.
  m('Sticker Limited Edition · Bar Ideal', 'Fai una foto al drink con l’adesivo del FantaSanRocco preso al Bar Ideal (se sei riuscito a prenderlo). Attenzione: gli adesivi sono limitati, non barate 😜', 'rara', { day: 12, sponsor: 'bar-ideal.png' }),
  m('Sticker Limited Edition · Chalet', 'Fai una foto al drink con l’adesivo del FantaSanRocco preso al Chalet (se sei riuscito a prenderlo). Attenzione: gli adesivi sono limitati, non barate 😜', 'rara', { day: 13, sponsor: 'chalet.png' }),
  m('Sticker Limited Edition · Revolution', 'Fai una foto al drink con l’adesivo del FantaSanRocco preso al Revolution (se sei riuscito a prenderlo). Attenzione: gli adesivi sono limitati, non barate 😜', 'rara', { day: 14, sponsor: 'revolution.png' }),
  m('Sticker Limited Edition · Bar V. Frasci 2.0', 'Fai una foto al drink con l’adesivo del FantaSanRocco preso al Bar V. Frasci 2.0 (se sei riuscito a prenderlo). Attenzione: gli adesivi sono limitati, non barate 😜', 'rara', { day: 15, sponsor: 'bar-frasci-2-0.png' }),
  m('Sticker Limited Edition · Zanzibar', 'Fai una foto al drink con l’adesivo del FantaSanRocco preso al Zanzibar (se sei riuscito a prenderlo). Attenzione: gli adesivi sono limitati, non barate 😜', 'rara', { day: 17, sponsor: 'zio-enrico.png' }),

  // ── IL PRONOSTICO SUL PRESENTATORE ───────────────────────────────
  // Non è più una missione. Era una foto-missione senza foto, con il colore
  // scritto a mano nella nota per lo staff: ogni sera qualcuno rispondeva
  // "verde bottiglia" contro "verde" e toccava decidere a mano.
  // Ora è un PRONOSTICO vero, come quello del Palio: opzioni fisse, 100
  // punti a chi indovina, accredito automatico. Sta in src/dati/pronostici.js
  // e si porta nel database con  node strumenti/patch_pronostici.js

  // ── SFIDE GIORNALIERE — 14 AGOSTO ────────────────────────────────
  // ── SFIDE GIORNALIERE — 13 AGOSTO ────────────────────────────────

  m('Mazzariello', 'Scatta una foto con Mazzariello.', 'rara', { day: 14 }),
  m('Groove Motion', 'Scatta una foto con un membro della Groove Motion Live Band.', 'rara', { day: 14 }),
  m('Arlecchino Rosso', 'Indossa un capo/accessorio rosso e scatta una foto.', 'non-comune', { day: 14 }),
  m('Selfie XXL', 'Flash! Fai entrare almeno 15 persone nello stesso selfie.', 'epica', { flash: true, day: 15 }),
  m('Flash Mob', 'Partecipa e fai una foto al flash mob organizzato dal Comitato San Rocco in collaborazione con il FantaSanRocco.', 'epica', { day: 14 }),

  // ── SFIDE GIORNALIERE — 15 AGOSTO ────────────────────────────────
  m('Napoliitudine', 'Scatta una foto con un membro della band "Napoliitudine".', 'epica', { day: 15 }),
  m('Arlecchino Arancione', 'Indossa un capo/accessorio arancione e scatta una foto.', 'non-comune', { day: 15 }),

  // ── SFIDE GIORNALIERE — 16 AGOSTO ────────────────────────────────
  m('Arlecchino Verde', 'Indossa un capo/accessorio verde e scatta una foto.', 'non-comune', { day: 16 }),
  m('Festa dei Folli', 'Immortala un’esibizione "pazza"!', 'epica', { day: 16 }),
  m('Skin', 'Scatta una foto indossando un outfit dello stesso colore del sindaco.', 'epica', { day: 16 }),
  m('Alfo & Mike', 'Scatta una foto con Alfo V. o con Mike Carotenuto in consolle.', 'rara', { day: 16 }),
  m('Momento Solenne', 'Riprendi l’entrata/uscita di San Rocco dalla chiesa durante la processione.', 'non-comune', { day: 16 }),
  m('Compleanno Leggendario', 'Scatta una foto con chi compie gli anni a San Rocco (+50 punti se si chiama Rocco).', 'leggendaria', { day: 16 }),
  m("Spalla d'Onore", 'Scatta una foto mentre porti San Rocco durante la processione.', 'epica', { day: 16 }),
  m('Il Portatore', 'Scatta una foto mentre si porta un santo durante la processione.', 'rara', { day: 16 }),
  m('In Cammino', 'Scatta una foto mentre partecipi alla processione.', 'comune', { day: 16 }),
  m('Limited Edition', 'Scatta un selfie con Rocco Botta mentre indossa la sua maglietta personalizzata.', 'epica', { day: 16 }),

  // ── SFIDE GIORNALIERE — 17 AGOSTO ────────────────────────────────
  m('Arlecchino Giallo', 'Indossa un capo/accessorio giallo e scatta una foto.', 'non-comune', { day: 17 }),
  m('LDA & Aka 7even', 'Scatta una foto con LDA o con Aka 7even.', 'epica', { day: 17 }),
  m('Disco Inferno', 'Scatta una foto con uno dei Disco Inferno.', 'rara', { day: 17 }),
  m('Alfonso Leo', 'Scatta una foto di Alfonso Leo che presenta i cantanti.', 'non-comune', { day: 17 }),
  m('Shh… non dirlo a nessuno!', 'Individua uno dei membri del team e scrivi qui nella nota la parola segreta che ti forniranno.', 'epica', { day: 17, photo: false }),
  m('In Bilico', 'Flash! Tutti in posa, ma su una sola gamba!', 'epica', { flash: true, day: 17 }),

  // ── SFIDE GIORNALIERE — 18 AGOSTO ────────────────────────────────
  m('Vagaband', 'Scatta una foto con un membro della Vagaband.', 'rara', { day: 18 }),
  m('Musicante', 'Scatta una foto mentre suoni uno strumento la sera dei fuochi.', 'rara', { day: 18 }),
  m('Campanile sotto i Fuochi', 'Scatta una foto del campanile mentre è illuminato dai fuochi d’artificio.', 'epica', { day: 18 }),
  m('Prima Fila', 'Scatta una foto mentre prendi posto a Piazza Mercato.', 'non-comune', { day: 18 }),
  m('Tutti Pronti', 'Scatta una foto della spesa per i fuochi.', 'non-comune', { day: 18 }),
  m('Tutti in Cerchio', 'Flash! Prendetevi per mano e formate un cerchio. Ricorda di scattare la foto!', 'epica', { flash: true, day: 18 }),

  // ── LA PAROLA UMANA — una parola diversa ogni sera ───────────────
  // Si fa in gruppo: i corpi formano le lettere. Vale per TUTTI quelli che
  // compaiono nella foto, non solo per chi la manda — ed e' il motivo per cui
  // la descrizione chiede i nomi utente nella nota: senza quelli lo staff
  // vede una foto di dieci persone e non sa a chi accreditare i punti.
  // La parola della sera esce con la sfida, cioe' alle 18: scriverla qui non
  // la rivela in anticipo, perche' le missioni del giorno non ancora aperto
  // non arrivano proprio nell'HTML di chi gioca.
  m('La Parola Umana · LOVE', 'Formate con i vostri corpi la parola LOVE e scattate la foto. Nella nota per lo staff scrivete i nomi utente di TUTTI quelli che compaiono nella foto: così i punti li prendono tutti, non solo chi la manda.', 'epica', { day: 13 }),
  m('La Parola Umana · CANE', 'Formate con i vostri corpi la parola CANE e scattate la foto. Nella nota per lo staff scrivete i nomi utente di TUTTI quelli che compaiono nella foto: così i punti li prendono tutti, non solo chi la manda.', 'epica', { day: 14 }),
  m('La Parola Umana · SOLE', 'Formate con i vostri corpi la parola SOLE e scattate la foto. Nella nota per lo staff scrivete i nomi utente di TUTTI quelli che compaiono nella foto: così i punti li prendono tutti, non solo chi la manda.', 'epica', { day: 15 }),
  m('La Parola Umana · ROCCO', 'Formate con i vostri corpi la parola ROCCO e scattate la foto. Nella nota per lo staff scrivete i nomi utente di TUTTI quelli che compaiono nella foto: così i punti li prendono tutti, non solo chi la manda.', 'epica', { day: 16 }),
  m('La Parola Umana · FUOCHI', 'Formate con i vostri corpi la parola FUOCHI e scattate la foto. Nella nota per lo staff scrivete i nomi utente di TUTTI quelli che compaiono nella foto: così i punti li prendono tutti, non solo chi la manda.', 'epica', { day: 17 }),
  m('La Parola Umana · SIANO', 'Formate con i vostri corpi la parola SIANO e scattate la foto. Nella nota per lo staff scrivete i nomi utente di TUTTI quelli che compaiono nella foto: così i punti li prendono tutti, non solo chi la manda.', 'epica', { day: 18 }),

  // ── FLASH SENZA GIORNO FISSO ─────────────────────────────────────
  // Peppe Tap Tap non si sa quando passa: la missione la sblocca lo staff
  // quando lo vede in giro, non un orario deciso a tavolino.
  m('Tap Tap', 'Flash! Scatta un selfie con Peppe Tap Tap.', 'non-comune', { flash: true, day: 13 }),

  // Le batterie sulla provinciale verso Bracigliano le montano la mattina del
  // 18, quindi vale solo quel giorno.
  m('Tutto Pronto per il Palio',
    'Scatta una foto mentre preparano i fuochi d’artificio sulla strada provinciale verso Bracigliano.',
    'epica', { day: 18 }),

  // ── MISSIONE A GIORNI ALTERNI ────────────────────────────────────
  // Vale il 13, 14, 15 e 17, ma NON il 16: la finestra fa da recinto esterno
  // e `giorni` ne ritaglia il buco.
];
module.exports = { MISSIONI: MISSIONS, PTS, EMOJI, DAY, DAY_PIENO, DAL_AL, PRONOSTICO, m };
