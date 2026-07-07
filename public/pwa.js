/* ===================================================================
   FantaSanRocco — PWA client
   • Registra il service worker.
   • Mostra il suggerimento "Aggiungi a Home" su iPhone/Safari.
   • Gestisce l'attivazione delle notifiche push (pulsante #pushBtn).
   =================================================================== */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('/sw.js').catch(function () {});

  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;

  function meta(name) { var m = document.querySelector('meta[name="' + name + '"]'); return m && m.getAttribute('content'); }

  // ── Suggerimento installazione su iOS (Safari, non ancora installata) ──
  function iosHint() {
    if (!isIOS || isStandalone) return;
    try { if (localStorage.getItem('pwaHintClosed') === '1') return; } catch (e) {}
    var bar = document.createElement('div');
    bar.className = 'pwa-hint';
    bar.innerHTML =
      '<span>Installa l’app: tocca <b>Condividi</b> e poi <b>“Aggiungi alla Home”</b>.</span>' +
      '<button type="button" class="pwa-hint-x" aria-label="Chiudi">×</button>';
    document.body.appendChild(bar);
    bar.querySelector('.pwa-hint-x').addEventListener('click', function () {
      bar.remove(); try { localStorage.setItem('pwaHintClosed', '1'); } catch (e) {}
    });
  }
  window.addEventListener('load', iosHint);

  // ── Notifiche push ────────────────────────────────────────────────
  function urlB64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = window.atob(base64);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }
  function pushSupported() {
    return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  }
  function setBtn(btn, state) {
    if (!btn) return;
    var labels = {
      on: '🔔 Avvisi attivi',
      off: '🔔 Attiva avvisi',
      unsupported: 'Avvisi non supportati',
      install: 'Installa l’app per gli avvisi',
    };
    btn.textContent = labels[state] || labels.off;
    btn.disabled = (state === 'unsupported' || state === 'on');
    btn.setAttribute('data-state', state);
  }
  function refreshBtn(btn) {
    if (!pushSupported()) { setBtn(btn, 'unsupported'); return; }
    if (isIOS && !isStandalone) { setBtn(btn, 'install'); return; }
    if (Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription();
      }).then(function (sub) { setBtn(btn, sub ? 'on' : 'off'); });
    } else {
      setBtn(btn, 'off');
    }
  }
  function enablePush(btn) {
    var key = meta('vapid-public-key');
    if (!key) { alert('Notifiche non configurate sul server.'); return; }
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') { setBtn(btn, 'off'); return; }
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) {
          return sub || reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlB64ToUint8Array(key),
          });
        });
      }).then(function (sub) {
        return fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': meta('csrf-token') || '' },
          credentials: 'include',
          body: JSON.stringify(sub),
        });
      }).then(function () { setBtn(btn, 'on'); });
    }).catch(function () { setBtn(btn, 'off'); });
  }
  window.addEventListener('load', function () {
    var btn = document.getElementById('pushBtn');
    if (!btn) return;
    refreshBtn(btn);
    btn.addEventListener('click', function () {
      if (btn.getAttribute('data-state') === 'on') return;
      if (isIOS && !isStandalone) {
        alert('Su iPhone: prima aggiungi l’app alla schermata Home (Condividi → Aggiungi alla Home), poi riaprila da lì per attivare gli avvisi.');
        return;
      }
      enablePush(btn);
    });
  });
})();
