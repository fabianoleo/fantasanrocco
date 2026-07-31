// ===================================================================
// FantaSanRocco — PLAYLIST di «Radio San Rocco»
// -------------------------------------------------------------------
// Solo l'elenco delle canzoni: la logica della stazione (timeline
// condivisa, chi sta suonando adesso) resta in server.js.
// ===================================================================

// ► COME AGGIUNGERE LE CANZONI: metti i file audio in public/radio/ e aggiungi
//   una voce qui sotto con src, title, (cover opzionale) e duration in secondi.
//   La durata si può leggere con:  afinfo public/radio/tuofile.mp3
const RADIO_PLAYLIST = [
  { src: "/radio/corri-san-rocco.mp3", title: "Corri San Rocco — Inno FantaSanRocco", cover: "/images/logo.png", duration: 195 },
  { src: "/radio/lda-aka-7even-andamento-lento-visual-video-ft-tullio-de-pisc.mp3", title: "LDA, Aka 7even — Andamento Lento ft. Tullio De Piscopo", cover: "/images/artisti/lda-aka7even.jpg", duration: 212 },
  { src: "/radio/lda-aka-7even-poesie-clandestine-official-video-sanremo-2026.mp3", title: "LDA, Aka 7even — Poesie Clandestine", cover: "/images/artisti/lda-aka7even.jpg", duration: 209 },
  { src: "/radio/mazzariello-amarsi-per-lavoro-sanremo-giovani-2025.mp3", title: "Mazzariello — Amarsi Per Lavoro", cover: "/images/artisti/mazzariello.jpg", duration: 185 },
  { src: "/radio/mazzariello-atti-estremi-in-luogo-pubblico-official-video-1.mp3", title: "Mazzariello — Atti Estremi In Luogo Pubblico", cover: "/images/artisti/mazzariello.jpg", duration: 171 },
  { src: "/radio/mazzariello-blindati-visual-video.mp3", title: "Mazzariello — Blindati", cover: "/images/artisti/mazzariello.jpg", duration: 122 },
  { src: "/radio/mazzariello-bombe-carta-visual-video.mp3", title: "Mazzariello — Bombe Carta", cover: "/images/artisti/mazzariello.jpg", duration: 184 },
  { src: "/radio/mazzariello-finestre-verdi-visual-video.mp3", title: "Mazzariello — Finestre Verdi", cover: "/images/artisti/mazzariello.jpg", duration: 205 },
  { src: "/radio/mazzariello-manifestazione-d-amore-official-video-sanremo-20.mp3", title: "Mazzariello — Manifestazione D'amore", cover: "/images/artisti/mazzariello-manifestazione.jpg", duration: 191 },
  { src: "/radio/mazzariello-millisecondi-visual-video.mp3", title: "Mazzariello — Millisecondi", cover: "/images/artisti/mazzariello.jpg", duration: 185 },
  { src: "/radio/mazzariello-nostalgia-karaoke-lyric-video.mp3", title: "Mazzariello — Nostalgia & Karaoke", cover: "/images/artisti/mazzariello.jpg", duration: 217 },
  { src: "/radio/mazzariello-orchidee-visual-video.mp3", title: "Mazzariello — Orchidee", cover: "/images/artisti/mazzariello.jpg", duration: 183 },
  { src: "/radio/mazzariello-per-un-milione-di-euro-official-video.mp3", title: "Mazzariello — Per Un Milione Di Euro", cover: "/images/artisti/mazzariello.jpg", duration: 180 },
  { src: "/radio/samurai-jay-ossessione.mp3", title: "Samurai Jay — Ossessione", cover: "/images/artisti/samurai-jay-ossessione.jpg", duration: 188 },
  { src: "/radio/serena-brancale-levante-delia-al-mio-paese-testolyrics.mp3", title: "Serena Brancale, Levante, DELIA — Al Mio Paese", cover: "/images/artisti/al-mio-paese.jpg", duration: 198 },
  { src: "/radio/serena-brancale-anema-e-core.mp3", title: "Serena Brancale — Anema e Core", cover: "/images/artisti/serena-brancale-anema-e-core.jpg", duration: 185 },
  { src: "/radio/mikesueg-cinema.mp3", title: "Mikesueg — Cinema", cover: "/images/artisti/mikesueg-cinema.jpg", duration: 215 },
  { src: "/radio/mikesueg-parigi.mp3", title: "Mikesueg — Parigi", cover: "/images/artisti/mikesueg-parigi.jpg", duration: 214 },
  { src: "/radio/mikesueg-senza-la-luna.mp3", title: "Mikesueg — Senza La Luna", cover: "/images/artisti/mikesueg-senza-la-luna.jpg", duration: 191 },
  { src: "/radio/mikesueg-paracadute.mp3", title: "Mikesueg — Paracadute", cover: "/images/artisti/mikesueg-paracadute.jpg", duration: 196 },
];

module.exports = { RADIO_PLAYLIST };
