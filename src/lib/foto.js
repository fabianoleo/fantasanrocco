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

// ── Dati EXIF dello scatto ────────────────────────────────────────────────
// Si legge PRIMA di ridimensionare, perché ricodificare una foto butta via
// tutti i metadati. Legge solo i primi 128kB: l'EXIF sta nel segmento APP1 a
// inizio file, e caricare un'immagine intera per una data sarebbe sprecato.
const EXIF_BYTES = 128 * 1024;

function datiScatto(fileAssoluto) {
  let fd;
  try {
    fd = fs.openSync(fileAssoluto, 'r');
    const buf = Buffer.alloc(EXIF_BYTES);
    const letti = fs.readSync(fd, buf, 0, EXIF_BYTES, 0);
    const t = require('exif-parser').create(buf.subarray(0, letti)).parse().tags || {};
    // DateTimeOriginal è lo scatto vero; gli altri due sono ripieghi (una
    // copia o un salvataggio li riscrive, quindi valgono meno).
    const scatto = t.DateTimeOriginal || t.CreateDate || t.ModifyDate || null;
    return {
      scatto: scatto ? new Date(scatto * 1000) : null,
      esatta: !!t.DateTimeOriginal,
      dispositivo: [t.Make, t.Model].filter(Boolean).join(' ').trim() || '',
      gps: t.GPSLatitude !== undefined && t.GPSLongitude !== undefined,
    };
  } catch (e) {
    return { scatto: null, esatta: false, dispositivo: '', gps: false };
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

// ── Rimpicciolimento delle foto caricate ──────────────────────────────────
// Le foto arrivano dal telefono a 3000-4000 pixel di lato e quasi 2 MB: roba
// da stampare un poster, mentre nel sito le guarda un moderatore dentro un
// riquadro e la galleria usa le miniature. A 1600px di lato lungo e qualità
// 80 pesano circa sei volte meno, e la differenza non si vede.
//
// Sull'orientamento non c'è niente da fare a mano: jimp applica già il tag
// EXIF quando legge, quindi i pixel che restituisce sono dritti e la foto
// ricodificata resta dritta anche senza più il tag. (Verificato: 18 foto su
// 19 di quelle già caricate hanno Orientation=6, e senza questo dettaglio
// sarebbero finite tutte di traverso.)
//
// Regola di fondo: se qualcosa va storto la foto originale resta dov'è.
// Nessuna ottimizzazione vale la perdita di una prova.
const LATO_MAX = 1600;
const QUALITA = 80;

async function ridimensiona(cartella, nomeFile) {
  const path = require('path');
  const originale = path.join(cartella, nomeFile);
  try {
    const primaByte = fs.statSync(originale).size;
    const { Jimp } = require('jimp');
    const img = await Jimp.read(originale);          // applica già l'orientamento

    const lato = Math.max(img.bitmap.width, img.bitmap.height);
    if (lato > LATO_MAX) {
      if (img.bitmap.width >= img.bitmap.height) img.resize({ w: LATO_MAX });
      else img.resize({ h: LATO_MAX });
    }
    const buf = await img.getBuffer('image/jpeg', { quality: QUALITA });

    // Se il risultato non è più piccolo non si tocca niente: capita con le
    // foto già ottimizzate, e riscriverle a vuoto peggiorerebbe la qualità.
    if (buf.length >= primaByte) return null;

    // Il contenuto ora è JPEG: se il file si chiamava .png o .webp il nome
    // deve seguirlo, altrimenti resta un'estensione che mente.
    const nuovoNome = nomeFile.replace(/\.[^.]+$/, '.jpg');
    const destinazione = path.join(cartella, nuovoNome);
    fs.writeFileSync(destinazione, buf);
    if (nuovoNome !== nomeFile) { try { fs.unlinkSync(originale); } catch {} }

    return { nomeFile: nuovoNome, prima: primaByte, dopo: buf.length, lato };
  } catch (e) {
    // Formati che jimp non digerisce (WebP e AVIF, per esempio): la foto
    // resta com'è. Meglio grande che persa.
    console.error('[FOTO] ridimensionamento saltato:', e.message);
    return null;
  }
}

module.exports = {
  PHASH_SOGLIA, photoHash, phashDistanza, checkImageMagicBytes,
  ALLOWED_MIME, MIME_TO_EXT, datiScatto, ridimensiona, LATO_MAX,
};
