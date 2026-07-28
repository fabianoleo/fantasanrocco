// ===================================================================
// Prepara un logo sponsor per la barra scura.
//   1. cancella la cornice sottile che alcuni export si portano dietro
//   2. rende trasparente il fondo pieno, partendo dai BORDI: le zone scure
//      racchiuse dentro il marchio (l'interno del globo, le squame del
//      pesce) restano intatte invece di diventare buchi
//   3. ritaglia il vuoto attorno: i loghi sono alti tutti uguali nella
//      barra, quindi chi ha più margine nel file apparirebbe più piccolo
//
// Uso:  node src/_prepara_loghi.js sorgente.png:destinazione.png [...]
// ===================================================================
const { Jimp } = require('jimp');

const TOLLERANZA = 42;   // scostamento ammesso dal colore di fondo
const CORNICE = 3;       // spessore del bordo da cancellare prima di iniziare
const ALTEZZA_MAX = 200; // nella barra sono alti 48px: 200 basta anche su retina

async function prepara(sorgente, destinazione) {
  const img = await Jimp.read(sorgente);
  const { width: w, height: h, data } = img.bitmap;
  const idx = (x, y) => (y * w + x) * 4;

  // Se il fondo è GIÀ trasparente non c'è niente da scontornare, e provarci
  // sarebbe un danno: il colore campionato sarebbe (0,0,0) e il riempimento
  // si mangerebbe i marchi neri, che sono proprio quelli da non toccare.
  const giaTrasparente = data[idx(0, 0) + 3] === 0;
  let fondo = null;

  if (!giaTrasparente) {
    // 1. via la cornice: certi export si portano dietro una riga di bordo
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x < CORNICE || y < CORNICE || x >= w - CORNICE || y >= h - CORNICE) {
          data[idx(x, y) + 3] = 0;
        }
      }
    }
    const o0 = idx(CORNICE, CORNICE);
    fondo = [data[o0], data[o0 + 1], data[o0 + 2]];
    const simile = (o) =>
      Math.abs(data[o] - fondo[0]) <= TOLLERANZA &&
      Math.abs(data[o + 1] - fondo[1]) <= TOLLERANZA &&
      Math.abs(data[o + 2] - fondo[2]) <= TOLLERANZA;

    // 2. riempimento a partire dal perimetro
    const visto = new Uint8Array(w * h);
    const coda = [];
    for (let x = 0; x < w; x++) coda.push([x, CORNICE], [x, h - 1 - CORNICE]);
    for (let y = 0; y < h; y++) coda.push([CORNICE, y], [w - 1 - CORNICE, y]);
    while (coda.length) {
      const [x, y] = coda.pop();
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const p = y * w + x;
      if (visto[p]) continue;
      const o = idx(x, y);
      if (data[o + 3] !== 0 && !simile(o)) continue;
      visto[p] = 1;
      data[o + 3] = 0;
      coda.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }

  // 3. ritaglio sul contenuto (alpha > 8, per non inseguire l'antialias)
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[idx(x, y) + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error(`${sorgente}: non è rimasto nulla dopo lo scontorno`);
  img.crop({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });

  // 4. rimpicciolimento: nella barra i loghi sono alti 48px, e stanno su OGNI
  //    pagina senza lazy loading. Tenerli a 1500px vorrebbe dire spedire
  //    qualche megabyte a ogni visita per disegnarne quaranta.
  if (img.bitmap.height > ALTEZZA_MAX) img.resize({ h: ALTEZZA_MAX });

  await img.write(destinazione);
  return {
    prima: `${w}x${h}`,
    dopo: `${img.bitmap.width}x${img.bitmap.height}`,
    fondo: fondo ? `rgb(${fondo})` : 'già trasparente',
  };
}

(async () => {
  for (const arg of process.argv.slice(2)) {
    const [da, a] = arg.split(':');
    const r = await prepara(da, a);
    console.log(`${a}  ${r.prima} → ${r.dopo}  (fondo: ${r.fondo})`);
  }
})();
