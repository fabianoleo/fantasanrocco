// ===================================================================
// Alleggerisce i loghi sponsor già pronti in public/sponsor/.
//
// I loghi arrivano dalle attività a misura da stampa: kursaal.png era
// 1865x200 e 449 kB per un marchio che nella barra si vede alto 48
// pixel. La barra sponsor sta nel layout, quindi quei file si scaricano
// tutti alla prima visita di chiunque.
//
// Cosa fa:
//   1. porta l'altezza a 144px (48 della barra × 3, che copre anche gli
//      schermi a densità tripla). Chi è già più basso non si tocca:
//      ingrandire un logo non aggiunge dettaglio, aggiunge solo peso.
//   2. riscrive il PNG con una TAVOLOZZA invece che a colori pieni. Un
//      marchio ha pochi colori, e in tavolozza pesa un quarto. La
//      trasparenza resta: senza, i loghi avrebbero un rettangolo nero
//      intorno sulla barra scura.
//
// Nome ed estensione NON cambiano, ed è deliberato: il nome del file è
// la chiave con cui le missioni indicano il proprio sponsor (colonna
// `sponsor` nel database) e con cui l'elenco in src/dati/sponsor.js
// decide quali loghi mostrare. Cambiarla vorrebbe dire rincorrere i
// riferimenti in due posti per un guadagno che non c'è.
//
// Se il risultato non è più leggero il file resta com'era: capita con i
// loghi già ottimizzati, e riscriverli a vuoto peggiorerebbe e basta.
//
// Uso:  node strumenti/ottimizza_loghi.js          (tutti)
//       node strumenti/ottimizza_loghi.js --prova  (dice cosa farebbe)
// ===================================================================
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const CARTELLA = path.join(__dirname, '..', 'public', 'sponsor');
const ALTEZZA = 144;

const soloProva = process.argv.includes('--prova');
const kb = (b) => (b / 1024).toFixed(0).padStart(4);

(async () => {
  const files = fs.readdirSync(CARTELLA).filter((f) => f.toLowerCase().endsWith('.png'));
  let prima = 0, dopo = 0, toccati = 0;

  for (const nome of files.sort()) {
    const percorso = path.join(CARTELLA, nome);
    const pesoPrima = fs.statSync(percorso).size;
    prima += pesoPrima;

    try {
      const meta = await sharp(percorso).metadata();
      const img = sharp(percorso);
      if (meta.height > ALTEZZA) img.resize({ height: ALTEZZA });
      const buf = await img.png({ palette: true, quality: 90, effort: 9 }).toBuffer();

      if (buf.length >= pesoPrima) {
        dopo += pesoPrima;
        console.log(`  = ${nome.padEnd(30)} ${kb(pesoPrima)} kB  già ottimizzato`);
        continue;
      }
      if (!soloProva) fs.writeFileSync(percorso, buf);
      dopo += buf.length;
      toccati++;
      const m2 = await sharp(buf).metadata();
      console.log(`  ↓ ${nome.padEnd(30)} ${kb(pesoPrima)} → ${kb(buf.length)} kB`
        + `  ${meta.width}x${meta.height} → ${m2.width}x${m2.height}`
        + (m2.hasAlpha ? '' : '  ⚠ ALFA PERSO'));
    } catch (e) {
      dopo += pesoPrima;
      console.log(`  ! ${nome.padEnd(30)} saltato: ${e.message}`);
    }
  }

  console.log(`\n  ${toccati} loghi su ${files.length} alleggeriti`);
  console.log(`  totale: ${(prima / 1024 / 1024).toFixed(2)} MB → ${(dopo / 1024 / 1024).toFixed(2)} MB`
    + `  (${(prima / dopo).toFixed(1)}× più leggero)`);
  if (soloProva) console.log('\n  --prova: nessun file è stato scritto.');
})();
