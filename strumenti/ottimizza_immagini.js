// ===================================================================
// Alleggerisce le immagini servite dal sito.
//
// Il problema è sempre lo stesso: i file arrivano alla misura in cui li
// manda chi li ha fatti, e il sito li mostra molto più piccoli. Il
// browser scarica tutto e rimpicciolisce lui, quindi si pagano byte che
// nessuno vede. Le larghezze qui sotto NON sono a occhio: sono state
// misurate in un browser vero, su telefono e su desktop, prendendo la
// resa più grande delle due.
//
// Regole di fondo:
//   · si tiene il FORMATO e il NOME. Sono la chiave con cui il codice e
//     il database indicano l'immagine (le missioni indicano lo sponsor
//     per nome file, i premi lo fanno in src/dati/premi.js): cambiarli
//     vorrebbe dire rincorrere i riferimenti in più posti.
//   · non si INGRANDISCE mai: chi è già più piccolo del bersaglio si
//     tocca solo per la ricompressione.
//   · se il risultato non è più leggero il file resta com'era. Capita
//     con quelli già ottimizzati, e riscriverli a vuoto peggiora e basta.
//
// Uso:  node strumenti/ottimizza_immagini.js            (tutte)
//       node strumenti/ottimizza_immagini.js --prova    (dice cosa farebbe)
//       node strumenti/ottimizza_immagini.js sponsor    (una sola cartella)
// ===================================================================
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PUB = path.join(__dirname, '..', 'public');

// `bersaglio` è la misura a cui si porta il lato indicato. Il 2× della resa
// misurata: sugli schermi a densità tripla la differenza su una fotografia
// non si vede, mentre il peso sì.
const REGOLE = [
  { nome: 'sponsor',  cartella: path.join(PUB, 'sponsor'),
    lato: 'height', bersaglio: 144, nota: 'barra sponsor, alta 48px' },
  { nome: 'artisti',  cartella: path.join(PUB, 'images', 'artisti'),
    lato: 'width',  bersaglio: 840, nota: 'card programmazione, larghe 420px' },
  { nome: 'premi',    cartella: path.join(PUB, 'images', 'premi'),
    lato: 'width',  bersaglio: 968, nota: 'schede premio, larghe 484px' },
];

// Ogni formato si riscrive come sé stesso. I loghi vanno in tavolozza —
// pochi colori, e in tavolozza pesano un quarto — le fotografie no, o
// verrebbero a bande.
function scrivi(pipe, formato, tavolozza) {
  if (formato === 'png')  return pipe.png({ palette: tavolozza, quality: 90, effort: 9 });
  if (formato === 'webp') return pipe.webp({ quality: 78, effort: 6 });
  if (formato === 'avif') return pipe.avif({ quality: 55, effort: 6 });
  return pipe.jpeg({ quality: 82, progressive: true, mozjpeg: true });
}

const soloProva = process.argv.includes('--prova');
const filtro = process.argv.slice(2).find((a) => !a.startsWith('--'));
const kb = (b) => (b / 1024).toFixed(0).padStart(4);

(async () => {
  let gPrima = 0, gDopo = 0, gToccati = 0;

  for (const r of REGOLE) {
    if (filtro && r.nome !== filtro) continue;
    if (!fs.existsSync(r.cartella)) continue;
    const files = fs.readdirSync(r.cartella).filter((f) => /\.(png|jpe?g|webp|avif)$/i.test(f)).sort();
    console.log(`\n══ ${r.nome} — ${r.nota} → ${r.lato} ${r.bersaglio}px ══`);
    let prima = 0, dopo = 0, toccati = 0;

    for (const nome of files) {
      const p = path.join(r.cartella, nome);
      const pesoPrima = fs.statSync(p).size;
      prima += pesoPrima;
      try {
        const meta = await sharp(p).metadata();
        // heif è come sharp chiama i file AVIF in lettura.
        const formato = meta.format === 'heif' ? 'avif' : meta.format;
        const pipe = sharp(p);
        if (meta[r.lato] > r.bersaglio) pipe.resize({ [r.lato]: r.bersaglio });
        const buf = await scrivi(pipe, formato, r.nome === 'sponsor').toBuffer();

        if (buf.length >= pesoPrima) {
          dopo += pesoPrima;
          console.log(`  = ${nome.padEnd(36)} ${kb(pesoPrima)} kB  già a posto`);
          continue;
        }
        if (!soloProva) fs.writeFileSync(p, buf);
        dopo += buf.length; toccati++;
        const m2 = await sharp(buf).metadata();
        console.log(`  ↓ ${nome.padEnd(36)} ${kb(pesoPrima)} → ${kb(buf.length)} kB`
          + `  ${meta.width}x${meta.height} → ${m2.width}x${m2.height}`
          + (meta.hasAlpha && !m2.hasAlpha ? '  ⚠ ALFA PERSO' : ''));
      } catch (e) {
        dopo += pesoPrima;
        console.log(`  ! ${nome.padEnd(36)} saltato: ${e.message}`);
      }
    }
    console.log(`  → ${toccati}/${files.length} alleggerite · ${(prima / 1024).toFixed(0)} → ${(dopo / 1024).toFixed(0)} kB`);
    gPrima += prima; gDopo += dopo; gToccati += toccati;
  }

  console.log(`\n  TOTALE: ${gToccati} immagini · ${(gPrima / 1024 / 1024).toFixed(2)} → ${(gDopo / 1024 / 1024).toFixed(2)} MB`
    + (gDopo ? `  (${(gPrima / gDopo).toFixed(1)}×)` : ''));
  if (soloProva) console.log('  --prova: nessun file è stato scritto.');
})();
