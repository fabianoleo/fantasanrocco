/* =====================================================================
   MEGA-MENU desktop — apertura tendina + anteprima immagine su hover
   (adattamento vanilla del componente "animated-slideshow")
   ===================================================================== */
(function () {
  'use strict';

  var mm = document.getElementById('megamenu');
  if (!mm) return;

  var trigger = document.getElementById('mmTrigger');
  var links = Array.prototype.slice.call(mm.querySelectorAll('.mega-link'));
  var shots = Array.prototype.slice.call(mm.querySelectorAll('.mm-shot'));
  if (!trigger || !links.length) return;

  // Spezza ogni etichetta in lettere per l'effetto stagger
  links.forEach(function (link) {
    var t = link.querySelector('.mega-link-text');
    if (!t) return;
    var text = t.textContent;
    t.textContent = '';
    text.split('').forEach(function (ch, i) {
      var s = document.createElement('span');
      s.style.setProperty('--i', i);
      if (ch === ' ') s.innerHTML = '&nbsp;';
      else s.textContent = ch;
      t.appendChild(s);
    });
  });

  function setActive(idx) {
    links.forEach(function (l) { l.classList.toggle('is-active', Number(l.dataset.mm) === idx); });
    shots.forEach(function (s) { s.classList.toggle('is-active', Number(s.dataset.mm) === idx); });
  }

  function open() { mm.classList.add('is-open'); trigger.setAttribute('aria-expanded', 'true'); }
  function close() { mm.classList.remove('is-open'); trigger.setAttribute('aria-expanded', 'false'); }

  // Hover/focus su un link → cambia immagine
  links.forEach(function (link) {
    link.addEventListener('mouseenter', function () { setActive(Number(link.dataset.mm)); });
    link.addEventListener('focus', function () { open(); setActive(Number(link.dataset.mm)); });
  });

  // Apertura: hover sull'intero menu (desktop) + click sul trigger (touch/click)
  mm.addEventListener('mouseenter', open);
  mm.addEventListener('mouseleave', close);
  trigger.addEventListener('click', function (e) {
    e.preventDefault();
    mm.classList.contains('is-open') ? close() : open();
  });

  // Esc chiude, click fuori chiude
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mm.classList.contains('is-open')) { close(); trigger.focus(); }
  });
  document.addEventListener('click', function (e) {
    if (!mm.contains(e.target)) close();
  });
})();
