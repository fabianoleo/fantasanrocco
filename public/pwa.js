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
      on: '🔔 Avvisi attivi · tocca per disattivare',
      off: '🔔 Attiva avvisi (+100 punti)',
      unsupported: 'Avvisi non supportati',
      install: 'Installa l’app per gli avvisi',
      working: 'Un attimo…',
    };
    btn.textContent = labels[state] || labels.off;
    btn.disabled = (state === 'unsupported' || state === 'working');
    btn.setAttribute('data-state', state);
  }
  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': meta('csrf-token') || '' },
      credentials: 'include',
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }
  function updateBalance(balance) {
    if (balance == null) return;
    var nb = document.querySelector('.nav-balance-val');
    if (nb) { nb.textContent = balance; nb.classList.remove('bump'); void nb.offsetWidth; nb.classList.add('bump'); }
  }
  function refreshBtn(btn) {
    if (!pushSupported()) { setBtn(btn, 'unsupported'); return; }
    if (isIOS && !isStandalone) { setBtn(btn, 'install'); return; }
    navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); })
      .then(function (sub) {
        if (sub && Notification.permission === 'granted') {
          setBtn(btn, 'on');
          // ri-sincronizza col server (idempotente): assicura user_id + bonus coerente
          post('/api/push/subscribe', sub).then(function (d) { if (d && d.balance != null) updateBalance(d.balance); }).catch(function () {});
        } else if (sub) {
          // Permesso revocato dal browser ma iscrizione ancora presente:
          // disiscrivi e togli il bonus (anti-trucco).
          var ep = sub.endpoint;
          sub.unsubscribe().catch(function () {});
          post('/api/push/unsubscribe', { endpoint: ep }).then(function (d) { if (d && d.balance != null) updateBalance(d.balance); }).catch(function () {});
          setBtn(btn, 'off');
        } else {
          setBtn(btn, 'off');
        }
      }).catch(function () { setBtn(btn, 'off'); });
  }
  function enablePush(btn) {
    var key = meta('vapid-public-key');
    if (!key) { alert('Notifiche non configurate sul server.'); return; }
    setBtn(btn, 'working');
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') { setBtn(btn, 'off'); return; }
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) {
          return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) });
        });
      }).then(function (sub) {
        return post('/api/push/subscribe', sub);
      }).then(function (d) {
        setBtn(btn, 'on');
        if (d && d.balance != null) updateBalance(d.balance);
        if (d && d.awarded) alert('Avvisi attivati! +' + (d.bonus || 100) + ' punti 🎉\nNota: se disattivi gli avvisi, i punti bonus verranno tolti.');
      });
    }).catch(function () { setBtn(btn, 'off'); });
  }
  function disablePush(btn) {
    setBtn(btn, 'working');
    navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); })
      .then(function (sub) {
        var ep = sub ? sub.endpoint : null;
        var un = sub ? sub.unsubscribe() : Promise.resolve();
        return un.then(function () { return post('/api/push/unsubscribe', { endpoint: ep }); });
      }).then(function (d) {
        setBtn(btn, 'off');
        if (d && d.balance != null) updateBalance(d.balance);
        if (d && d.removed) alert('Avvisi disattivati. I 100 punti bonus sono stati rimossi.');
      }).catch(function () { refreshBtn(btn); });
  }
  window.addEventListener('load', function () {
    var btn = document.getElementById('pushBtn');
    if (!btn) return;
    refreshBtn(btn);
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      if (isIOS && !isStandalone) {
        alert('Su iPhone: prima aggiungi l’app alla schermata Home (Condividi → Aggiungi alla Home), poi riaprila da lì per attivare gli avvisi.');
        return;
      }
      if (btn.getAttribute('data-state') === 'on') {
        if (!window.confirm('Disattivare gli avvisi? Perderai i 100 punti bonus.')) return;
        disablePush(btn);
      } else {
        enablePush(btn);
      }
    });
  });
})();
