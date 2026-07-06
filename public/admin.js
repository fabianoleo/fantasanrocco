/* ===================================================================
   Admin — QR premio: scarica come PNG o copia l'immagine negli appunti.
   L'SVG del QR viene disegnato su un canvas e convertito in PNG.
   =================================================================== */
// Conferma prima di inviare i form marcati con data-confirm.
// (La CSP ha script-src-attr 'none' → gli onsubmit inline non funzionano,
//  quindi la conferma va agganciata qui via addEventListener.)
(function () {
  'use strict';
  var forms = document.querySelectorAll('form[data-confirm]');
  Array.prototype.forEach.call(forms, function (f) {
    f.addEventListener('submit', function (e) {
      if (!window.confirm(f.getAttribute('data-confirm'))) e.preventDefault();
    });
  });
})();

(function () {
  'use strict';
  var cards = document.querySelectorAll('.reward-qr[data-code]');
  if (!cards.length) return;

  // Converte l'SVG del QR di una card in un Blob PNG (fondo bianco, ad alta risoluzione)
  function svgToPng(card, cb) {
    var svg = card.querySelector('.reward-qr-img svg');
    if (!svg) { cb(null); return; }
    var size = 512;
    var data = new XMLSerializer().serializeToString(svg);
    var url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = size; c.height = size;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      try { c.toBlob(function (b) { cb(b); }, 'image/png'); } catch (e) { cb(null); }
    };
    img.onerror = function () { cb(null); };
    img.src = url;
  }

  function feedback(btn, text) {
    if (!btn) return;
    var prev = btn.getAttribute('data-label') || btn.innerHTML;
    if (!btn.getAttribute('data-label')) btn.setAttribute('data-label', prev);
    btn.textContent = text;
    setTimeout(function () { btn.innerHTML = btn.getAttribute('data-label'); }, 1500);
  }

  Array.prototype.forEach.call(cards, function (card) {
    var code = card.getAttribute('data-code') || 'qr';
    var dl = card.querySelector('.qr-dl');
    var cp = card.querySelector('.qr-copy');

    if (dl) dl.addEventListener('click', function () {
      svgToPng(card, function (blob) {
        if (!blob) { feedback(dl, 'Errore'); return; }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'qr-' + code + '.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        feedback(dl, 'Scaricato');
      });
    });

    if (cp) cp.addEventListener('click', function () {
      if (!navigator.clipboard || !window.ClipboardItem) { feedback(cp, 'Non supportato'); return; }
      svgToPng(card, function (blob) {
        if (!blob) { feedback(cp, 'Errore'); return; }
        try {
          navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
            .then(function () { feedback(cp, 'Copiato!'); })
            .catch(function () { feedback(cp, 'Errore'); });
        } catch (e) { feedback(cp, 'Non supportato'); }
      });
    });
  });
})();
