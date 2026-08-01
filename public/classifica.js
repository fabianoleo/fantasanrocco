/* ===================================================================
   FantaSanRocco — Paginazione delle classifiche
   Le righe sono già tutte nell'HTML: qui si nascondono quelle fuori
   pagina. Fatto così, senza JavaScript resta una classifica intera e
   leggibile, mentre paginare lato server avrebbe voluto dire un giro
   di rete per sfogliare dieci nomi.

   La pagina non riparte da capo a ogni disegno: se c'è la riga di chi
   guarda, si apre direttamente sulla sua — in una classifica lunga
   ritrovarsi è la prima cosa che si vuole fare.
   =================================================================== */
(function () {
  'use strict';

  function avvia(wrap) {
    const righe = Array.from(wrap.querySelectorAll('.lbc-riga'));
    const perPagina = parseInt(wrap.dataset.perPagina, 10) || 10;
    const pager = wrap.querySelector('.lbc-pager');
    if (righe.length <= perPagina) return;   // ci stanno tutte: niente pager

    const pagine = Math.ceil(righe.length / perPagina);
    const stato = pager.querySelector('.lbc-pg-stato');
    const prev = pager.querySelector('.lbc-pg-prev');
    const next = pager.querySelector('.lbc-pg-next');

    // Si parte dalla pagina dove sta la riga di chi guarda, non dalla prima.
    const mio = righe.findIndex((r) => r.classList.contains('lbc-mio'));
    let pagina = mio >= 0 ? Math.floor(mio / perPagina) : 0;

    function disegna() {
      const da = pagina * perPagina;
      const a = da + perPagina;
      righe.forEach((r, i) => { r.hidden = (i < da || i >= a); });
      stato.textContent = `${pagina + 1} / ${pagine}`;
      prev.disabled = pagina === 0;
      next.disabled = pagina === pagine - 1;
    }

    prev.addEventListener('click', () => { if (pagina > 0) { pagina--; disegna(); } });
    next.addEventListener('click', () => { if (pagina < pagine - 1) { pagina++; disegna(); } });

    pager.hidden = false;
    disegna();
  }

  document.querySelectorAll('[data-lb-pager]').forEach(avvia);
})();
