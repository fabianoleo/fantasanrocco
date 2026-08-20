// ===================================================================
// FantaSanRocco — QUANTO ABBIAMO RACCOLTO (il motore)
// -------------------------------------------------------------------
// Il totale della raccolta NON esiste nel database, e non è una svista da
// rimediare: la missione chiedeva una FOTO, non una cifra. Il modulo d'invio
// ha solo un campo libero «Nota per lo staff», facoltativo. Quindi da nessuna
// parte c'è scritto quanto ha dato ciascuno: c'è scritto CHI ha donato,
// QUANDO, e c'è la sua foto.
//
// Questo file mette insieme quello che c'è e prepara il foglio dove l'unica
// cosa che va fatta a mano si fa a mano: guardare la foto e scrivere la cifra.
//
// PERCHÉ STA QUI E NON DENTRO LO STRUMENTO
// Il foglio serve in due posti che non possono condividere un file di
// strumenti: la riga di comando (che scrive un .html su disco) e il pannello
// admin (che lo serve dal sito). Tenere due copie della stessa tabella e
// della stessa somma voleva dire che prima o poi una delle due avrebbe contato
// in modo diverso dall'altra, e nessuno se ne sarebbe accorto fino a quando
// i due totali non fossero finiti nello stesso discorso.
//
// L'UNICA differenza fra i due usi è DA DOVE arrivano le foto: da una cartella
// accanto al file, oppure dall'indirizzo /uploads del sito. È un parametro.
// ===================================================================
const fs = require('fs');
const path = require('path');

// ── Una cifra dentro il testo libero, se c'è ────────────────────────
// Si accettano «10€», «€ 10», «10 euro», «€ 5,50», «30 EUR». Il punto e la
// virgola valgono entrambi da separatore decimale: in una nota scritta col
// pollice nessuno sta attento a quale dei due usa.
//
// Il simbolo e la parola vogliono due trattamenti diversi. Sulla parola serve
// il confine (\b) o «euro» aggancerebbe pezzi di altre parole; sul simbolo il
// confine NON va messo, ed è un errore già fatto e misurato: «10€» finisce con
// un carattere non alfabetico, quindi dopo non c'è nessun \b e la cifra
// scritta nel modo più comune di tutti veniva persa in silenzio.
const SOLDI = '(?:€|\\beur\\b|\\beuro\\b)';
const CIFRA = '([0-9]+(?:[.,][0-9]{1,2})?)';
const RE_IMPORTO = new RegExp(`${SOLDI}\\s*${CIFRA}|${CIFRA}\\s*${SOLDI}`, 'i');

function importoDaNota(nota) {
  if (!nota) return null;
  const m = String(nota).match(RE_IMPORTO);
  if (!m) return null;
  const n = parseFloat(String(m[1] || m[2]).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const dataIt = (s) => {
  if (!s) return '';
  // Il database scrive in UTC; qui si legge in ora italiana, come ovunque.
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return String(s);
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Rome',
  }).format(d);
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── I dati ──────────────────────────────────────────────────────────
// La missione si cerca per pezzo di titolo: «Cuore d'Oro» ha l'apostrofo
// tipografico in alcuni punti e quello dritto in altri, e cercarla per
// uguaglianza esatta fallirebbe proprio sul carattere sbagliato.
function raccogli(db, { missione = "Cuore d'Oro", fotoDir } = {}) {
  const chiave = missione.replace(/['’]/g, '_');
  const missioni = db.prepare(
    "SELECT id, title, points FROM missions WHERE title LIKE ? ESCAPE '\\'"
  ).all('%' + chiave.replace(/[%_]/g, (c) => (c === '_' ? '_' : '\\%')) + '%');

  if (!missioni.length) {
    const tutte = db.prepare('SELECT id, title FROM missions ORDER BY id').all();
    const e = new Error(`Nessuna missione col titolo simile a «${missione}».`);
    e.missioniPresenti = tutte;
    throw e;
  }

  const ids = missioni.map((m) => m.id);
  const righe = db.prepare(`
    SELECT s.id, s.created_at, s.status, s.photo_path, s.note, s.shot_at,
           COALESCE(u.nickname, '(account eliminato)') AS nickname
    FROM submissions s
    LEFT JOIN users u ON u.id = s.user_id
    WHERE s.mission_id IN (${ids.map(() => '?').join(',')})
      AND s.status = 'approved'
    ORDER BY s.created_at ASC
  `).all(...ids);

  let precompilati = 0;
  const voci = righe.map((r) => {
    const imp = importoDaNota(r.note);
    if (imp !== null) precompilati++;
    const file = r.photo_path ? path.basename(r.photo_path) : '';
    // Senza cartella non si può controllare che il file ci sia: si assume di sì
    // e se manca il browser mostrerà l'immagine rotta. Serve al percorso del
    // pannello, dove le foto le serve il sito e non stanno accanto al foglio.
    const esiste = file && (!fotoDir || fs.existsSync(path.join(fotoDir, file)));
    return { ...r, file, esiste, importo: imp };
  });

  return {
    missione: missioni[0],
    voci,
    donatori: new Set(voci.map((v) => v.nickname)).size,
    senzaFoto: voci.filter((v) => !v.esiste).length,
    precompilati,
  };
}

// ── Il foglio ───────────────────────────────────────────────────────
// Le foto NON vengono incorporate: si linkano. Incorporarle produrrebbe un
// HTML da centinaia di MB che nessun browser apre volentieri.
//
// `baseFoto` è l'unica cosa che cambia fra i due usi: una cartella relativa
// («data/uploads») per il file su disco, un indirizzo del sito («/uploads»)
// per il pannello.
function foglio({ missione, voci, donatori, senzaFoto, precompilati }, { baseFoto } = {}) {
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Raccolta beneficenza — ${esc(missione.title)}</title>
<style>
  :root { --oro:#d4a01a; --bg:#faf8f4; --testo:#1c1a16; --bordo:#e3ddd0; }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--testo);
         font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  header { position:sticky; top:0; z-index:5; background:#fff;
           border-bottom:2px solid var(--oro); padding:1rem 1.25rem;
           box-shadow:0 2px 12px rgba(0,0,0,.06); }
  h1 { margin:0 0 .2rem; font-size:1.25rem; }
  .sotto { color:#6b6558; font-size:.85rem; }
  .totale { float:right; text-align:right; }
  .totale b { display:block; font-size:2rem; color:var(--oro); line-height:1.1; }
  .totale span { font-size:.75rem; color:#6b6558; text-transform:uppercase; letter-spacing:.05em; }
  main { padding:1.25rem; max-width:900px; margin:0 auto; }
  .voce { display:flex; gap:1rem; align-items:flex-start; background:#fff;
          border:1px solid var(--bordo); border-radius:12px; padding:.85rem;
          margin-bottom:.75rem; }
  .voce img { width:120px; height:120px; object-fit:cover; border-radius:8px;
              background:#eee; cursor:zoom-in; flex:0 0 auto; }
  .vuota { width:120px; height:120px; border-radius:8px; background:#f0ece2;
           display:flex; align-items:center; justify-content:center;
           color:#a89f8c; font-size:.75rem; text-align:center; padding:.5rem; flex:0 0 auto; }
  .chi { font-weight:700; }
  .quando { color:#6b6558; font-size:.85rem; }
  .nota { margin:.4rem 0 .6rem; padding:.4rem .6rem; background:#f6f3ec;
          border-left:3px solid var(--oro); border-radius:4px; font-size:.9rem; }
  .campo { display:flex; align-items:center; gap:.4rem; }
  .campo input { width:120px; padding:.45rem .6rem; font-size:1rem;
                 border:1px solid var(--bordo); border-radius:8px; }
  .campo input.pieno { border-color:var(--oro); background:#fffdf5; font-weight:700; }
  .dedotto { font-size:.75rem; color:var(--oro); }
  .barra { margin:1.5rem 0; padding:1rem; background:#fff;
           border:1px solid var(--bordo); border-radius:12px; }
  button { font:inherit; padding:.5rem .9rem; border:1px solid var(--oro);
           background:var(--oro); color:#1c1a16; border-radius:8px; cursor:pointer; font-weight:600; }
  button.ghost { background:#fff; }
  dialog { border:none; border-radius:12px; padding:0; max-width:95vw; max-height:95vh; }
  dialog img { display:block; max-width:95vw; max-height:90vh; }
  @media print { header{position:static} .campo input{border:none} button{display:none} }
</style></head><body>

<header>
  <div class="totale"><b id="tot">€ 0,00</b><span>raccolto</span></div>
  <h1>${esc(missione.title)}</h1>
  <div class="sotto">
    ${voci.length} prove approvate · ${donatori} persone · ${precompilati} importi letti dalle note
    ${senzaFoto ? ` · <strong>${senzaFoto} senza foto sul disco</strong>` : ''}
  </div>
</header>

<main>
  <div class="barra">
    <strong>Come si usa:</strong> apri ogni foto, leggi la cifra e scrivila nella casella.
    Il totale in alto si aggiorna da solo. Quello che scrivi resta salvato in questo browser.
    <div style="margin-top:.6rem; display:flex; gap:.5rem; flex-wrap:wrap">
      <button onclick="copia()">Copia il riepilogo</button>
      <button class="ghost" onclick="window.print()">Stampa / salva in PDF</button>
      <button class="ghost" onclick="if(confirm('Cancellare tutti gli importi scritti?')){localStorage.removeItem(CHIAVE);location.reload()}">Azzera importi</button>
    </div>
  </div>

${voci.map((v, i) => `  <div class="voce" data-i="${i}">
    ${v.esiste
      ? `<img src="${esc(baseFoto)}/${esc(v.file)}" loading="lazy" alt="prova di ${esc(v.nickname)}" onclick="ingrandisci(this.src)">`
      : `<div class="vuota">foto non trovata<br><small>${esc(v.file || 'nessun file')}</small></div>`}
    <div style="flex:1; min-width:0">
      <div class="chi">${esc(v.nickname)}</div>
      <div class="quando">${esc(dataIt(v.created_at))}</div>
      ${v.note ? `<div class="nota">${esc(v.note)}</div>` : ''}
      <div class="campo">
        <span>€</span>
        <input type="number" step="0.01" min="0" data-i="${i}"
               value="${v.importo !== null ? v.importo : ''}"
               placeholder="0,00">
        ${v.importo !== null ? '<span class="dedotto">letto dalla nota</span>' : ''}
      </div>
    </div>
  </div>`).join('\n')}
</main>

<dialog id="lente" onclick="this.close()"><img id="lenteImg" alt=""></dialog>

<script>
const CHIAVE = 'fsr.beneficenza.${missione.id}';
const NOMI = ${JSON.stringify(voci.map((v) => v.nickname))};
const campi = [...document.querySelectorAll('input[type=number]')];

const salvati = JSON.parse(localStorage.getItem(CHIAVE) || '{}');
campi.forEach((c) => { if (salvati[c.dataset.i] !== undefined) c.value = salvati[c.dataset.i]; });

function somma() {
  let t = 0, dati = {};
  campi.forEach((c) => {
    const v = parseFloat(c.value);
    c.classList.toggle('pieno', Number.isFinite(v) && v > 0);
    if (Number.isFinite(v)) { t += v; dati[c.dataset.i] = c.value; }
  });
  localStorage.setItem(CHIAVE, JSON.stringify(dati));
  document.getElementById('tot').textContent =
    '€ ' + t.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return t;
}
campi.forEach((c) => c.addEventListener('input', somma));
somma();

function ingrandisci(src) {
  document.getElementById('lenteImg').src = src;
  document.getElementById('lente').showModal();
}

function copia() {
  const righe = [];
  let t = 0;
  campi.forEach((c) => {
    const v = parseFloat(c.value);
    if (Number.isFinite(v) && v > 0) { righe.push(NOMI[c.dataset.i] + ': € ' + v.toFixed(2)); t += v; }
  });
  const quante = righe.length;
  righe.push('');
  righe.push('TOTALE RACCOLTO: € ' + t.toFixed(2) + ' da ' + quante + ' donazioni');
  navigator.clipboard.writeText(righe.join('\\n'))
    .then(() => alert('Riepilogo copiato.'))
    .catch(() => alert(righe.join('\\n')));
}
</script>
</body></html>`;
}

module.exports = { raccogli, foglio, importoDaNota, dataIt, esc };
