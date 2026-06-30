/* ===================================================================
   Mappa interattiva di Siano — Leaflet + tile scure (OSM/CARTO)
   I luoghi arrivano dal server (#siaPlaces, coordinate in [lat,lng]).
   Clic su marker/lista → flyTo + card con eventi collegati.
   =================================================================== */
(function () {
  'use strict';
  if (typeof L === 'undefined') return;                 // Leaflet non caricato
  var mapEl = document.getElementById('siaMap');
  var dataEl = document.getElementById('siaPlaces');
  if (!mapEl || !dataEl) return;

  var places;
  try { places = JSON.parse(dataEl.textContent); } catch (e) { return; }

  var CENTER = [40.802, 14.694], ZOOM = 14, ZOOM_PLACE = 17;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var card = document.getElementById('siaCard');
  var reset = document.getElementById('siaReset');
  var listItems = Array.prototype.slice.call(document.querySelectorAll('.sia-li'));

  // ── Mappa ──────────────────────────────────────────────────────
  var map = L.map(mapEl, {
    center: CENTER, zoom: ZOOM,
    scrollWheelZoom: false,          // niente "trappola" allo scroll della pagina
    zoomControl: true, attributionControl: true,
  });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);
  setTimeout(function () { map.invalidateSize(); }, 200);

  // ── Marker personalizzati (numerati: legame con lista e card) ──
  function pinHtml(num, delay) {
    return '<span class="sia-pulse"></span>' +
      '<span class="sia-marker-inner" style="animation-delay:' + delay + 's">' +
      '<svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M12 0C5.4 0 0 5.2 0 11.6 0 20 12 32 12 32s12-12 12-20.4C24 5.2 18.6 0 12 0z" fill="#f5c842" stroke="#b8841a" stroke-width="1"/>' +
      '<circle cx="12" cy="11.4" r="6" fill="#1a1206"/></svg>' +
      '<span class="sia-marker-num">' + num + '</span></span>';
  }
  var byId = {}, markers = {}, drawn = 0;
  places.forEach(function (p, i) {
    p._num = i + 1;                       // numero coerente con la lista
    byId[p.id] = p;
    if (p.coordinates && p.coordinates.length === 2) {
      var ic = L.divIcon({ className: 'sia-marker', html: pinHtml(p._num, drawn * 0.09), iconSize: [34, 42], iconAnchor: [17, 42] });
      var m = L.marker([p.coordinates[0], p.coordinates[1]], { icon: ic, title: p.name, riseOnHover: true }).addTo(map);
      m.bindTooltip(p.name, { direction: 'top', className: 'sia-tip', offset: [0, -38] });
      m.on('click', (function (id) { return function () { selectPlace(id); }; })(p.id));
      markers[p.id] = m;
      drawn++;
    }
  });

  // ── Card ───────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function fillCard(p) {
    var numEl = document.getElementById('siaCardNum'); if (numEl) numEl.textContent = p._num || '';
    document.getElementById('siaCardName').textContent = p.name;
    document.getElementById('siaCardAddr').textContent = p.address || 'Siano (SA)';
    var desc = document.getElementById('siaCardDesc');
    if (p.description) { desc.textContent = p.description; desc.hidden = false; } else { desc.hidden = true; }
    // immagine: quella del luogo, oppure quella del primo evento collegato
    var media = document.getElementById('siaCardMedia');
    var img = p.image || (p.events.find(function (e) { return e.image; }) || {}).image || '';
    if (img) { media.style.backgroundImage = 'url("' + img + '")'; media.hidden = false; } else { media.hidden = true; media.style.backgroundImage = ''; }
    // eventi collegati
    var ev = document.getElementById('siaCardEvents');
    if (p.events && p.events.length) {
      ev.innerHTML = p.events.map(function (e) {
        return '<div class="sia-ev"><span class="sia-ev-when"><span class="sia-ev-day">' + esc(e.day) +
          '</span><span class="sia-ev-time">' + esc(e.time) + '</span></span><span class="sia-ev-title">' + esc(e.title) + '</span></div>';
      }).join('');
    } else {
      ev.innerHTML = '<p class="sia-card-empty">Nessun evento collegato a questo luogo.</p>';
    }
  }

  function flyToPlace(coords) {
    var ll = L.latLng(coords[0], coords[1]);
    if (reduce) { map.setView(ll, ZOOM_PLACE); return; }
    if (window.matchMedia('(max-width: 899px)').matches) {
      // alza il punto sopra il bottom-sheet così il marker resta visibile
      var pt = map.project(ll, ZOOM_PLACE).subtract([0, map.getSize().y * 0.22]);
      map.flyTo(map.unproject(pt, ZOOM_PLACE), ZOOM_PLACE, { duration: 1.1 });
    } else {
      map.flyTo(ll, ZOOM_PLACE, { duration: 1.1 });
    }
  }

  function selectPlace(id) {
    var p = byId[id]; if (!p) return;
    // cross-fade del contenuto se la card è già aperta (cambio luogo morbido)
    if (!card.hidden && !reduce) {
      card.classList.add('is-swap');
      setTimeout(function () { fillCard(p); card.classList.remove('is-swap'); }, 170);
    } else {
      fillCard(p);
    }
    card.hidden = false;
    listItems.forEach(function (li) { li.classList.toggle('is-active', li.dataset.place === id); });
    Object.keys(markers).forEach(function (k) {
      var el = markers[k].getElement(); if (el) { el.classList.toggle('is-active', k === id); el.classList.remove('is-hover'); }
    });
    mapEl.classList.add('has-active');
    reset.hidden = false;
    if (p.coordinates) flyToPlace(p.coordinates);
  }

  function backToOverview() {
    card.hidden = true; reset.hidden = true;
    mapEl.classList.remove('has-active');
    listItems.forEach(function (li) { li.classList.remove('is-active'); });
    Object.keys(markers).forEach(function (k) { var el = markers[k].getElement(); if (el) el.classList.remove('is-active'); });
    if (reduce) map.setView(CENTER, ZOOM); else map.flyTo(CENTER, ZOOM, { duration: 0.9 });
  }

  // ── Eventi UI ──────────────────────────────────────────────────
  function hoverMarker(id, on) { var m = markers[id]; if (!m) return; var el = m.getElement(); if (el) el.classList.toggle('is-hover', on); }
  listItems.forEach(function (li) {
    li.addEventListener('click', function () { selectPlace(li.dataset.place); });
    li.addEventListener('mouseenter', function () { hoverMarker(li.dataset.place, true); });
    li.addEventListener('mouseleave', function () { hoverMarker(li.dataset.place, false); });
  });
  if (reset) reset.addEventListener('click', backToOverview);
  var cardClose = document.getElementById('siaCardClose');
  if (cardClose) cardClose.addEventListener('click', backToOverview);

  // ── Programmazione: clic su un evento → scende alla mappa col luogo scelto ──
  (function () {
    var titles = document.querySelectorAll('.pg-card-title[data-map-place]');
    if (!titles.length) return;
    function goToPlace(id) {
      var sec = document.getElementById('mappa');
      if (sec) { try { sec.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); } catch (e) { sec.scrollIntoView(); } }
      setTimeout(function () { selectPlace(id); }, reduce ? 0 : 480);
    }
    Array.prototype.forEach.call(titles, function (h2) {
      var id = h2.getAttribute('data-map-place');
      var art = h2.closest('.pg-card'); if (!art) return;
      art.classList.add('pg-clickable');
      art.addEventListener('click', function (e) {
        if (e.target.closest('a, button')) return;   // non rubare i clic ai link interni (IG ecc.)
        goToPlace(id);
      });
      var body = art.querySelector('.pg-card-body') || art;
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'pg-map-hint';
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg> Vedi sul luogo';
      btn.addEventListener('click', function (e) { e.stopPropagation(); goToPlace(id); });
      body.appendChild(btn);
    });
  })();
})();
