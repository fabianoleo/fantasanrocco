// ===================================================================
// FantaSanRocco — FOTO: impronte e controlli
// -------------------------------------------------------------------
// Due lavori separati sulle immagini caricate:
//  · l'impronta percettiva, per riconoscere che due prove sono la stessa
//    foto anche se ricompressa o passata da WhatsApp
//  · il controllo dei primi byte, per accertarsi che un file che si
//    dichiara immagine lo sia davvero
// Nessuno dei due tocca il database o le rotte: sono funzioni pure sul
// contenuto di un file, ed e' per questo che stanno per conto loro.
// ===================================================================
const fs = require('fs');

// ── Impronta percettiva delle foto (riconoscere i duplicati) ───────────────
// dHash: la foto viene ridotta a 9×8 in scala di grigi e ogni pixel viene
// confrontato con quello alla sua destra → 64 bit. Due immagini uguali danno
// impronte quasi identiche anche dopo ricompressione o ridimensionamento,
// perché il rapporto di luminosità fra pixel vicini non cambia.
//
// Soglia scelta misurando le foto vere già caricate:
//   file identico 0 · via WhatsApp max 4 · ricompressa max 2 · screenshot max 3
//   foto DIVERSE fra loro: mai sotto 8
// Con 5 restiamo dentro tutti i duplicati reali e lontani dalle foto diverse.
// Il ritaglio deliberato (fino a 13) sfugge: allargare la soglia
// significherebbe accusare foto diverse, e qui un falso positivo costa caro.
const PHASH_SOGLIA = 5;

async function photoHash(filePath) {
  try {
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
  } catch (e) {
    // Formato che jimp non digerisce (capita con qualche AVIF/JPEG anomalo):
    // niente impronta, la prova passa comunque. Non è un motivo per bloccarla.
    console.error('[PHASH]', e.message);
    return null;
  }
}

// Quanti bit differiscono fra due impronte (distanza di Hamming)
function phashDistanza(a, b) {
  try {
    let x = BigInt('0x' + a) ^ BigInt('0x' + b);
    let n = 0;
    while (x) { n += Number(x & 1n); x >>= 1n; }
    return n;
  } catch (e) { return 64; }
}

// Magic bytes check sincrono — no dipendenze esterne, no CVE, no loop infinito
const ALLOWED_MIME = new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif']);
const MIME_TO_EXT  = { 'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif','image/avif':'.avif' };

function checkImageMagicBytes(filePath) {
  try {
    const fd  = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    if (buf[0]===0xFF && buf[1]===0xD8 && buf[2]===0xFF) return 'image/jpeg';
    if (buf.slice(0,8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]))) return 'image/png';
    if (buf.slice(0,4).toString('ascii')==='RIFF' && buf.slice(8,12).toString('ascii')==='WEBP') return 'image/webp';
    if (buf.slice(0,6).toString('ascii')==='GIF87a' || buf.slice(0,6).toString('ascii')==='GIF89a') return 'image/gif';
    // AVIF: ftyp box (offset 4) contiene 'avif' o 'avis'
    if (buf.slice(4,8).toString('ascii')==='ftyp' && (buf.slice(8,12).toString('ascii').startsWith('avif') || buf.slice(8,12).toString('ascii').startsWith('avis'))) return 'image/avif';
    return null;
  } catch { return null; }
}

module.exports = { PHASH_SOGLIA, photoHash, phashDistanza, checkImageMagicBytes, ALLOWED_MIME };
