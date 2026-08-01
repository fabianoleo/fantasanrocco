/* ===================================================================
   FantaSanRocco — «Sbircia» le sfide speciali
   Toglie il velo dalle sfide non ancora uscite. È una lente, non una
   pubblicazione: scopre le carte solo nella pagina di chi preme, e
   ricaricando tornano coperte. Non tocca niente sul server.

   Il pulsante esiste solo nelle pagine dello staff — è il server a
   decidere se stamparlo, e solo lì manda anche i testi da scoprire.
   Per tutti gli altri le sfide coperte non hanno proprio contenuto
   nell'HTML, quindi non c'è niente da svelare nemmeno smanettando.
   =================================================================== */
(function () {
  'use strict';

  const bottone = document.querySelector('[data-ms-sbircia]');
  if (!bottone) return;

  const etichetta = bottone.querySelector('.ms-sbircia-txt');

  bottone.addEventListener('click', function () {
    const scoperto = document.body.classList.toggle('ms-svelato');
    bottone.setAttribute('aria-pressed', scoperto ? 'true' : 'false');
    if (etichetta) etichetta.textContent = scoperto ? 'Ricopri' : 'Sbircia';
  });
})();
