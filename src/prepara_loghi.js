// ===================================================================
// Prepara un logo sponsor per la barra scura.
//   1. cancella la cornice sottile che alcuni export si portano dietro
//   2. rende trasparente il fondo pieno, partendo dai BORDI: le zone scure
//      racchiuse dentro il marchio (l'interno del globo, le squame del
//      pesce) restano intatte invece di diventare buchi
//   3. ritaglia il vuoto attorno: i loghi sono alti tutti uguali nella
//      barra, quindi chi ha più margine nel file apparirebbe più piccolo
//
// Uso:  node src/prepara_loghi.js sorgente.png:destinazione.png [...]
//
// Con --schiarisci prima di un file, quel logo viene anche schiarito: si
// inverte la LUMINOSITÀ lasciando stare tinta e saturazione, quindi il nero
// diventa bianco e il marrone diventa crema, ma restano marrone e crema
// invece di virare al blu come farebbe un negativo. Serve per i marchi
// disegnati per la carta bianca, che su fondo scuro sparirebbero.
//
//   node src/prepara_loghi.js --schiarisci loghi-png/x.png:x.png
//
// Con --schiarisci-scuri, invece, si schiariscono SOLO i neri e i grigi e i
// colori del marchio restano quelli. Serve ai loghi a due facce: un simbolo
// già acceso più una scritta nera sotto. Schiarendo tutto si salverebbe la
// scritta ma si spegnerebbe il simbolo.
//
//   node src/prepara_loghi.js --schiarisci-scuri loghi-png/x.png:x.png
// ===================================================================
const { Jimp } = require('jimp');

const TOLLERANZA = 42;   // scostamento ammesso dal colore di fondo
const CORNICE = 3;       // spessore del bordo da cancellare prima di iniziare
const ALTEZZA_MAX = 200; // nella barra sono alti 48px: 200 basta anche su retina

// Soglie di --schiarisci-scuri: sotto entrambe il pixel è "nero da stampa"
// e va schiarito, sopra è un colore del marchio e si lascia stare. I numeri
// vengono dal logo Athena, dove la scritta nera e il fulmine giallo si
// dividono in due gruppi netti (33% scuro-slavato, 61% chiaro-saturo).
const SATURAZIONE_MAX = 0.35;
const LUMINOSITA_MAX = 0.5;

// rgb → hsl → rgb, con la sola L ribaltata. Passare per HSL invece di fare
// 255-x su ogni canale è tutta la differenza: il negativo puro sposta anche
// la tinta, e un girasole giallo diventerebbe azzurro.
function schiarisciPixel(d, o) {
  const r = d[o] / 255, g = d[o + 1] / 255, b = d[o + 2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let hh = 0, s = 0;
  if (mx !== mn) {
    const c = mx - mn;
    s = l > 0.5 ? c / (2 - mx - mn) : c / (mx + mn);
    if (mx === r) hh = ((g - b) / c + (g < b ? 6 : 0));
    else if (mx === g) hh = (b - r) / c + 2;
    else hh = (r - g) / c + 4;
    hh /= 6;
  }
  const l2 = 1 - l;
  if (s === 0) { d[o] = d[o + 1] = d[o + 2] = Math.round(l2 * 255); return; }
  const q = l2 < 0.5 ? l2 * (1 + s) : l2 + s - l2 * s;
  const p = 2 * l2 - q;
  const canale = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  d[o] = Math.round(canale(hh + 1 / 3) * 255);
  d[o + 1] = Math.round(canale(hh) * 255);
  d[o + 2] = Math.round(canale(hh - 1 / 3) * 255);
}

// Vero solo per i neri e i grigi da stampa. Serve ai marchi a due facce, tipo
// Athena: fulmine giallo che sul fondo scuro si vede benissimo, e sotto la
// scritta nera che sparisce. Schiarire tutto salverebbe la scritta ma
// spegnerebbe il giallo in un oliva, quindi si tocca solo la parte slavata.
function eScuroSlavato(d, o) {
  const r = d[o] / 255, g = d[o + 1] / 255, b = d[o + 2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (l >= LUMINOSITA_MAX) return false;
  if (mx === mn) return true;                      // grigio puro
  const c = mx - mn;
  const s = l > 0.5 ? c / (2 - mx - mn) : c / (mx + mn);
  return s < SATURAZIONE_MAX;
}

async function prepara(sorgente, destinazione, schiarisci = false) {
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

  // 3-bis. schiarimento, solo se richiesto. Va fatto DOPO lo scontorno: sui
  // pixel di fondo non ha senso, e su quelli già trasparenti non si vedrebbe.
  let toccati = 0;
  if (schiarisci) {
    const dd = img.bitmap.data;
    for (let o = 0; o < dd.length; o += 4) {
      if (dd[o + 3] === 0) continue;
      if (schiarisci === 'scuri' && !eScuroSlavato(dd, o)) continue;
      schiarisciPixel(dd, o); toccati++;
    }
  }

  // 4. rimpicciolimento: nella barra i loghi sono alti 48px, e stanno su OGNI
  //    pagina senza lazy loading. Tenerli a 1500px vorrebbe dire spedire
  //    qualche megabyte a ogni visita per disegnarne quaranta.
  if (img.bitmap.height > ALTEZZA_MAX) img.resize({ h: ALTEZZA_MAX });

  await img.write(destinazione);
  return {
    prima: `${w}x${h}`,
    dopo: `${img.bitmap.width}x${img.bitmap.height}`,
    fondo: fondo ? `rgb(${fondo})` : 'già trasparente',
    toccati,
  };
}

(async () => {
  // Le opzioni valgono per il file che le segue, non per tutti
  let schiarisci = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === '--schiarisci') { schiarisci = 'tutto'; continue; }
    if (arg === '--schiarisci-scuri') { schiarisci = 'scuri'; continue; }
    const [da, a] = arg.split(':');
    const r = await prepara(da, a, schiarisci);
    const nota = schiarisci === 'tutto' ? ', schiarito'
               : schiarisci === 'scuri' ? `, schiariti ${r.toccati} pixel scuri` : '';
    console.log(`${a}  ${r.prima} → ${r.dopo}  (fondo: ${r.fondo}${nota})`);
    schiarisci = false;
  }
})();
