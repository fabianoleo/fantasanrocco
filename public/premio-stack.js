/* ===================================================================
   FantaSanRocco — Mazzo di foto dei premi
   Le carte stanno una sopra l'altra; si sfoglia trascinando su e giù,
   con le frecce ai lati o con i tasti direzionali.

   Il JS non anima niente a mano: scrive su ogni carta la sua posizione
   nel mazzo (--pos) e la transizione la fa il CSS. Durante il
   trascinamento la carta davanti segue il dito con una trasformazione
   inline, e le transizioni si spengono (classe is-drag) perché
   altrimenti inseguirebbero il dito con mezzo secondo di ritardo.
   =================================================================== */
(function () {
  'use strict';

  // Oltre questa distanza dal dito la carta cambia; sotto, torna al suo posto.
  const SOGLIA = 45;      // px
  const SOGLIA_VEL = 0.5; // px/ms: uno scatto veloce conta anche se corto
  // ...ma solo se il dito si è mosso almeno di tanto. Senza questo minimo un
  // tocco secco vale una velocità altissima (pochi pixel diviso pochi
  // millisecondi) e sfogliare basterebbe sfiorare la foto.
  const MIN_SCATTO = 14;  // px

  function avvia(stack) {
    const lista = stack.querySelector('.pz-stack-cards');
    const carte = Array.from(stack.querySelectorAll('.pz-stack-card'));
    const pallini = Array.from(stack.querySelectorAll('.pz-stack-dot'));
    const n = carte.length;
    if (n < 2) return;

    const visibili = parseInt(getComputedStyle(stack).getPropertyValue('--pz-stack-visibili'), 10) || 4;
    let fronte = 0;   // indice, in `carte`, della carta davanti

    function disegna() {
      for (let k = 0; k < n; k++) {
        // Quanto è indietro questa carta rispetto a quella davanti.
        const pos = (k - fronte + n) % n;
        const c = carte[k];
        c.style.setProperty('--pos', pos);
        // Le carte oltre il fondo del mazzo si spengono: continuare la
        // scaletta all'infinito non si legge e costa comunque al compositore.
        if (pos >= visibili) c.setAttribute('data-oltre', '');
        else c.removeAttribute('data-oltre');
        if (pos === 0) c.setAttribute('data-fronte', '');
        else c.removeAttribute('data-fronte');
      }
      pallini.forEach((p, k) => {
        if (k === fronte) p.setAttribute('data-on', '');
        else p.removeAttribute('data-on');
      });
    }

    function vai(passo) {
      fronte = (fronte + passo + n) % n;
      disegna();
    }

    stack.querySelector('.pz-stack-next').addEventListener('click', () => vai(1));
    stack.querySelector('.pz-stack-prev').addEventListener('click', () => vai(-1));
    pallini.forEach((p, k) => p.addEventListener('click', () => { fronte = k; disegna(); }));

    // Tasti direzionali: il mazzo entra nel giro delle tabulazioni, così si
    // sfoglia anche senza mouse. Su e giù come il trascinamento, destra e
    // sinistra come le frecce ai lati.
    lista.tabIndex = 0;
    lista.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { vai(1); e.preventDefault(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { vai(-1); e.preventDefault(); }
    });

    // ── Trascinamento ──────────────────────────────────────────────────
    let idPuntatore = null, y0 = 0, t0 = 0, dy = 0;

    function giu(e) {
      // Solo la carta davanti si trascina, e solo col tasto principale.
      const davanti = carte[fronte];
      if (!davanti.contains(e.target) || e.button > 0) return;
      idPuntatore = e.pointerId;
      y0 = e.clientY; t0 = e.timeStamp; dy = 0;
      stack.classList.add('is-drag');
      // La cattura tiene il dito agganciato alla carta anche se esce dal
      // riquadro. Se il browser la rifiuta si sfoglia lo stesso, solo che
      // uscendo dalla foto il trascinamento si interrompe.
      try { davanti.setPointerCapture(idPuntatore); } catch (e) {}
    }

    function muovi(e) {
      if (e.pointerId !== idPuntatore) return;
      dy = e.clientY - y0;
      // Resistenza: la carta segue il dito ma sempre meno, così non scappa
      // fuori dal riquadro se si tira mezzo schermo.
      const seguito = Math.sign(dy) * Math.pow(Math.abs(dy), 0.82);
      carte[fronte].style.transform = 'translate3d(0,' + seguito + 'px,0) scale(1.02)';
    }

    function su(e) {
      if (e.pointerId !== idPuntatore) return;
      const vel = Math.abs(dy) / Math.max(1, e.timeStamp - t0);
      const carta = carte[fronte];
      idPuntatore = null;
      stack.classList.remove('is-drag');
      // Via la trasformazione inline: da qui in poi comanda di nuovo il CSS,
      // che riporta la carta al suo posto o la manda in fondo con la sua
      // transizione. Lasciarla vincerebbe su tutto e la carta resterebbe lì.
      carta.style.transform = '';
      const scatto = vel > SOGLIA_VEL && Math.abs(dy) > MIN_SCATTO;
      if (Math.abs(dy) > SOGLIA || scatto) vai(dy < 0 ? 1 : -1);
      dy = 0;
    }

    lista.addEventListener('pointerdown', giu);
    lista.addEventListener('pointermove', muovi);
    lista.addEventListener('pointerup', su);
    lista.addEventListener('pointercancel', su);

    disegna();
    stack.setAttribute('data-pronto', '');  // sblocca frecce e pallini nel CSS
  }

  document.querySelectorAll('[data-pz-stack]').forEach(avvia);
})();
