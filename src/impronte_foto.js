// ===================================================================
// FantaSanRocco — Impronte delle foto già caricate
// -------------------------------------------------------------------
// Le prove inviate PRIMA del controllo duplicati non hanno l'impronta:
// senza, non verrebbero mai confrontate. Questo script la calcola per
// tutte quelle che ne sono sprovviste. È idempotente: rilanciarlo salta
// quelle già fatte, quindi si può ripetere senza pensieri.
//
// Uso (in produzione, dentro il container):
//   cd /app && node src/impronte_foto.js
// ===================================================================
const path = require('path');
const fs = require('fs');
const { db, UPLOADS_DIR } = require('./db');

async function dhash(filePath) {
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

(async () => {
  const da_fare = db.prepare(
    'SELECT id, photo_path FROM submissions WHERE phash IS NULL AND photo_path IS NOT NULL'
  ).all();
  console.log(`Prove senza impronta: ${da_fare.length}`);

  const aggiorna = db.prepare('UPDATE submissions SET phash = ? WHERE id = ?');
  let fatte = 0, mancanti = 0, illeggibili = 0;

  for (const s of da_fare) {
    const file = path.join(UPLOADS_DIR, path.basename(s.photo_path));
    if (!fs.existsSync(file)) { mancanti++; continue; }
    try {
      aggiorna.run(await dhash(file), s.id);
      fatte++;
    } catch (e) {
      illeggibili++;
      console.log(`  ⚠️  #${s.id} ${s.photo_path}: ${e.message}`);
    }
  }

  console.log(`Fatto: ${fatte} impronte calcolate` +
    (mancanti ? `, ${mancanti} con file mancante` : '') +
    (illeggibili ? `, ${illeggibili} illeggibili` : '') + '.');
  const tot = db.prepare('SELECT COUNT(*) c FROM submissions WHERE phash IS NOT NULL').get().c;
  console.log(`In totale ora ${tot} prove hanno l'impronta.`);
})();
