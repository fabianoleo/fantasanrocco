/* ===================================================================
   FantaSanRocco — Zona sicura in alto (tacca / barra di stato)
   -------------------------------------------------------------------
   Il CSS userebbe env(safe-area-inset-top), ma nell'app aggiunta alla
   schermata Home iOS a volte restituisce 0 anche quando la pagina finisce
   davvero sotto la barra di stato: il contenuto che scorre si vede lassù.
   Qui misuriamo il valore vero e lo pubblichiamo come --safe-top, che il
   CSS usa al posto di env(). Caricato nel <head> senza defer: gira prima
   che venga disegnato qualcosa, così non c'è nessuno sfarfallio.
   =================================================================== */
(function () {
  'use strict';
  var root = document.documentElement;

  // Quanto vale env(safe-area-inset-top) secondo il browser?
  function daCss() {
    try {
      var p = document.createElement('div');
      p.style.cssText = 'position:fixed;top:0;left:0;width:1px;' +
        'height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
      root.appendChild(p);
      var h = p.getBoundingClientRect().height;
      p.remove();
      return h;
    } catch (e) { return 0; }
  }

  // Siamo nell'app installata (non in una scheda del browser)?
  function appInstallata() {
    if (window.navigator.standalone === true) return true;          // iOS
    try { return window.matchMedia('(display-mode: standalone)').matches; }
    catch (e) { return false; }
  }

  function calcola() {
    var inset = daCss();
    if (inset > 0) return inset;              // il sistema ce lo dice: ci fidiamo
    if (!appInstallata()) return 0;           // nel browser la barra non è nostra

    // App installata ed env() muto. Se il viewport è alto quanto lo schermo,
    // vuol dire che la pagina occupa TUTTO, barra di stato compresa: quella
    // striscia va coperta. Se invece il sistema l'ha già riservata, avanza
    // spazio e non c'è nulla da fare.
    var schermo = Math.max(screen.width || 0, screen.height || 0);
    var avanzo = schermo - window.innerHeight;
    if (avanzo > 20) return 0;

    // Altezza della barra di stato per famiglia di iPhone.
    if (schermo >= 852) return 59;   // Dynamic Island
    if (schermo >= 780) return 47;   // tacca
    return 20;                       // modelli col pulsante Home
  }

  function applica() {
    root.style.setProperty('--safe-top', calcola() + 'px');
  }

  applica();
  // La rotazione cambia la zona sicura: rimisuriamo (con un attimo di calma,
  // il viewport si assesta dopo l'evento).
  window.addEventListener('orientationchange', function () { setTimeout(applica, 250); });
  window.addEventListener('resize', function () { setTimeout(applica, 250); });
})();
