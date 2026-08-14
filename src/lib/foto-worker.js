// ===================================================================
// FantaSanRocco — Il thread che lavora le foto
// -------------------------------------------------------------------
// Sta qui per una ragione sola: jimp è JavaScript puro e macina i pixel
// sul thread da cui lo chiami. Una foto da telefono (4032×3024) tiene
// occupato quel thread per quasi un secondo — misurato — e finché dura
// il server non risponde a NESSUNO: né ai giocatori, né ai controlli di
// salute del proxy. Quando il proxy smette di ricevere risposta dichiara
// il sito morto, ed è da lì che arriva il «bad gateway» mentre la gente
// carica le foto.
//
// Spostando il lavoro qui, il thread principale resta libero di
// rispondere. Le foto ci mettono lo stesso tempo — il lavoro è quello —
// ma il sito continua a funzionare mentre lo fa.
// ===================================================================
const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');

// Le costanti stanno in foto.js e arrivano nel messaggio: tenerne una
// seconda copia qui vorrebbe dire cambiarle in due posti e dimenticarsene.

async function ridimensiona({ cartella, nomeFile, latoMax, qualita }) {
  const originale = path.join(cartella, nomeFile);
  const primaByte = fs.statSync(originale).size;
  const { Jimp } = require('jimp');
  const img = await Jimp.read(originale);          // applica già l'orientamento

  const lato = Math.max(img.bitmap.width, img.bitmap.height);
  if (lato > latoMax) {
    if (img.bitmap.width >= img.bitmap.height) img.resize({ w: latoMax });
    else img.resize({ h: latoMax });
  }
  const buf = await img.getBuffer('image/jpeg', { quality: qualita });

  // Se il risultato non è più piccolo non si tocca niente: capita con le
  // foto già ottimizzate, e riscriverle a vuoto peggiorerebbe la qualità.
  if (buf.length >= primaByte) return null;

  // Il contenuto ora è JPEG: se il file si chiamava .png o .webp il nome
  // deve seguirlo, altrimenti resta un'estensione che mente.
  const nuovoNome = nomeFile.replace(/\.[^.]+$/, '.jpg');
  fs.writeFileSync(path.join(cartella, nuovoNome), buf);
  if (nuovoNome !== nomeFile) { try { fs.unlinkSync(originale); } catch {} }

  return { nomeFile: nuovoNome, prima: primaByte, dopo: buf.length, lato };
}

async function impronta({ filePath }) {
  const { Jimp } = require('jimp');
  const img = await Jimp.read(filePath);
  img.greyscale().resize({ w: 9, h: 8 });
  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const a = img.bitmap.data[(img.bitmap.width * y + x) * 4];
      const b = img.bitmap.data[(img.bitmap.width * y + x + 1) * 4];
      bits += a > b ? '1' : '0';
    }
  }
  return BigInt('0b' + bits).toString(16).padStart(16, '0');
}

const LAVORI = { ridimensiona, impronta };

parentPort.on('message', async (msg) => {
  try {
    const valore = await LAVORI[msg.azione](msg);
    parentPort.postMessage({ id: msg.id, ok: true, valore });
  } catch (e) {
    parentPort.postMessage({ id: msg.id, ok: false, errore: e.message });
  }
});
