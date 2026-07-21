// ===================================================================
// FantaSanRocco — Set icone SVG (monoline, oro)
// Sostituiscono le emoji nell'interfaccia per un look più raffinato.
// Uso nelle view EJS:  <%- icon('flame') %>  oppure  <%- icon('flame', 'is-fire') %>
// Le icone ereditano dimensione (width:1em) e colore (currentColor)
// dal contenitore, quindi rimpiazzano le emoji senza rompere il layout.
// ===================================================================

const P = [
  'fill="none"',
  'stroke="currentColor"',
  'stroke-width="1.6"',
  'stroke-linecap="round"',
  'stroke-linejoin="round"',
].join(' ');

// Ogni voce è il contenuto interno dell'<svg> (viewBox 0 0 24 24).
const PATHS = {
  // ── Premi / classifica ──────────────────────────────────────────
  // Medaglia con nastro: il colore (oro/argento/bronzo) arriva dal contesto.
  medal:
    '<path d="M8.5 3 7 8.5" /><path d="m15.5 3 1.5 5.5" />' +
    '<circle cx="12" cy="14.5" r="5" />' +
    '<path d="m12 12 .9 1.8 2 .3-1.45 1.4.35 2L12 17.8l-1.8.95.35-2L9.1 14.1l2-.3z" stroke-width="1.1" />',
  trophy:
    '<path d="M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 2.5" />' +
    '<path d="M17 6h2.5A2.5 2.5 0 0 1 17 8.5" /><path d="M12 13v3" /><path d="M9 20h6" /><path d="M10 16.5h4l.5 3.5h-5z" />',

  // ── Identità / sicurezza ───────────────────────────────────────
  // Marchio San Rocco: pellegrino stilizzato (cerchio + bastone).
  pilgrim:
    '<circle cx="12" cy="12" r="9" /><circle cx="12" cy="8.2" r="1.7" />' +
    '<path d="M12 10.4v6.4" /><path d="M9.4 13.2 12 11.6l2.6 1.6" /><path d="M15.6 6.6v9.6" stroke-width="1.2" />',
  shield:
    '<path d="M12 3 5 6v5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z" />',
  'shield-check':
    '<path d="M12 3 5 6v5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z" /><path d="m9 11.5 2 2 4-4" />',
  glass:
    '<path d="M7 4h8l-1 7a3 3 0 0 1-6 0z" /><path d="M9.5 14.5h5" /><path d="M12 14.5V19" /><path d="M9.5 19h5" />',
  car:
    '<path d="M5 16v-3l1.6-4.2A2 2 0 0 1 8.5 7.5h7a2 2 0 0 1 1.9 1.3L19 13v3" />' +
    '<path d="M4 13h16" /><circle cx="7.5" cy="16.5" r="1.5" /><circle cx="16.5" cy="16.5" r="1.5" />',
  people:
    '<circle cx="9" cy="8" r="2.6" /><path d="M4 19a5 5 0 0 1 10 0" />' +
    '<path d="M15.5 6.2a2.6 2.6 0 0 1 0 5" /><path d="M16 14.4A5 5 0 0 1 20 19" />',
  cross:
    '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" />',

  // ── Tempo / momenti della giornata ──────────────────────────────
  moon:
    '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5" />',
  sun:
    '<circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8" />',
  sunset:
    '<path d="M12 4v5" /><path d="m8.5 6.5 1.4 1.4M15.5 6.5l-1.4 1.4" /><path d="M3 14a9 9 0 0 1 18 0" />' +
    '<path d="M2.5 18h19" /><path d="M6.5 21h11" />',
  clock:
    '<circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" />',
  alarm:
    '<circle cx="12" cy="13" r="7" /><path d="M12 9.5V13l2.5 1.5" /><path d="m5 4 3 2.5M19 4l-3 2.5" />',
  candle:
    '<path d="M12 3c1.6 1.4 1.6 3-0 4-1.6-1-1.6-2.6 0-4z" /><path d="M9.5 9.5h5V20h-5z" /><path d="M12 7.2V9.5" />',
  ticket:
    '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4z" />' +
    '<path d="M13 7v2M13 12v2" stroke-dasharray="0.5 2.5" />',
  pin:
    '<path d="M12 21s6-5.3 6-10a6 6 0 0 0-12 0c0 4.7 6 10 6 10z" /><circle cx="12" cy="11" r="2.2" />',

  // ── Musica / spettacolo ─────────────────────────────────────────
  music:
    '<path d="M9 17V5l10-2v12" /><circle cx="6.5" cy="17.5" r="2.5" /><circle cx="16.5" cy="15.5" r="2.5" />',
  guitar:
    '<path d="M14.5 3.5 17 6l-2 2 1 1-4.5 4.5" /><circle cx="8" cy="16" r="4.2" /><circle cx="8" cy="16" r="1.4" />',
  headphones:
    '<path d="M5 13v-1a7 7 0 0 1 14 0v1" /><rect x="3.5" y="13" width="3.5" height="6" rx="1.5" /><rect x="17" y="13" width="3.5" height="6" rx="1.5" />',
  flame:
    '<path d="M12 3c.5 3-2.5 4-2.5 7a2.5 2.5 0 0 0 5 0c0-1 .5-1.7.5-1.7s2 2.2 2 4.7a5.5 5.5 0 0 1-11 0c0-4.2 4-5.5 6-10z" />',
  fireworks:
    '<path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8" />' +
    '<circle cx="12" cy="12" r="1.4" />',
  // Logo: esplosione di fuoco d'artificio (raggi con scintille in punta)
  'logo-firework':
    '<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />' +
    '<path d="M12 11V4M12 13v7M11 12H4M13 12h7M11.1 11.1 6.2 6.2M12.9 12.9l4.9 4.9M12.9 11.1l4.9-4.9M11.1 12.9l-4.9 4.9" />' +
    '<circle cx="12" cy="3.4" r="0.7" fill="currentColor" stroke="none" />' +
    '<circle cx="12" cy="20.6" r="0.7" fill="currentColor" stroke="none" />' +
    '<circle cx="3.4" cy="12" r="0.7" fill="currentColor" stroke="none" />' +
    '<circle cx="20.6" cy="12" r="0.7" fill="currentColor" stroke="none" />' +
    '<circle cx="5.7" cy="5.7" r="0.6" fill="currentColor" stroke="none" />' +
    '<circle cx="18.3" cy="18.3" r="0.6" fill="currentColor" stroke="none" />' +
    '<circle cx="18.3" cy="5.7" r="0.6" fill="currentColor" stroke="none" />' +
    '<circle cx="5.7" cy="18.3" r="0.6" fill="currentColor" stroke="none" />',

  // ── Stati / azioni ──────────────────────────────────────────────
  check:
    '<path d="m5 12.5 4.5 4.5L19 6.5" />',
  'check-circle':
    '<circle cx="12" cy="12" r="8.5" /><path d="m8.5 12 2.5 2.5 4.5-5" />',
  hourglass:
    '<path d="M7 4h10M7 20h10" /><path d="M7 4c0 4 5 4 5 8s-5 4-5 8" /><path d="M17 4c0 4-5 4-5 8s5 4 5 8" />',
  repeat:
    '<path d="M4 9a5 5 0 0 1 5-5h7" /><path d="m13 1 3 3-3 3" /><path d="M20 15a5 5 0 0 1-5 5H8" /><path d="m11 23-3-3 3-3" />',
  camera:
    '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.2" />',
  x:
    '<path d="M6 6l12 12M18 6 6 18" />',
  'chevron-left':
    '<path d="M15 5l-7 7 7 7" />',
  'chevron-right':
    '<path d="M9 5l7 7-7 7" />',
  warning:
    '<path d="M12 4 21 19H3z" /><path d="M12 10v4" /><path d="M12 16.5v.01" />',
  lock:
    '<rect x="5" y="10.5" width="14" height="9" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /><path d="M12 14v2.5" />',
  key:
    '<circle cx="8" cy="14" r="4" /><path d="m11 11 8-8" /><path d="m16 6 2 2M18.5 3.5 21 6" />',
  gear:
    '<circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />',
  plus:
    '<path d="M12 5v14M5 12h14" />',
  sparkle:
    '<path d="M12 3c.6 4.5 1.5 5.4 6 6-4.5.6-5.4 1.5-6 6-.6-4.5-1.5-5.4-6-6 4.5-.6 5.4-1.5 6-6z" /><path d="M19 13c.3 1.7.7 2.1 2.4 2.4-1.7.3-2.1.7-2.4 2.4-.3-1.7-.7-2.1-2.4-2.4 1.7-.3 2.1-.7 2.4-2.4z" stroke-width="1.1" />',

  // ── Premi (dettagli) ────────────────────────────────────────────
  gift:
    '<rect x="4" y="9" width="16" height="11" rx="1" /><path d="M4 13h16M12 9v11" />' +
    '<path d="M12 9S10.5 4.5 8 5.5 9 9 12 9zM12 9s1.5-4.5 4-3.5S15 9 12 9z" />',
  globe:
    '<circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.5 2.4 2.5 14.6 0 17M12 3.5c-2.5 2.4-2.5 14.6 0 17" />',
  hotel:
    '<path d="M4 20V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v14" /><path d="M15 11h4a1 1 0 0 1 1 1v8" />' +
    '<path d="M3 20h18" /><path d="M7.5 8.5h3M7.5 12h3M7.5 15.5h3" />',
  gamepad:
    '<rect x="3" y="8" width="18" height="9" rx="4.5" /><path d="M7.5 11v3M6 12.5h3" /><circle cx="15.5" cy="12" r="1" /><circle cx="17.5" cy="14" r="1" />',
  box:
    '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5" /><path d="M12 12v9" />',
  target:
    '<circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" />',
  coffee:
    '<path d="M5 8h12v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" /><path d="M17 9h2a2.5 2.5 0 0 1 0 5h-2" /><path d="M8 3.5c.7.7.7 1.3 0 2M11.5 3.5c.7.7.7 1.3 0 2" />',
  bean:
    '<ellipse cx="12" cy="12" rx="6" ry="8" transform="rotate(35 12 12)" /><path d="M9 8c2.5 2 2.5 6 0 8" />',

  // ── Generici ────────────────────────────────────────────────────
  dot:
    '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />',
  list:
    '<path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" />',
  save:
    '<path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4" /><rect x="8" y="13" width="8" height="5" />',
  trash:
    '<path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" />',
  bolt:
    '<path d="M13 3 4 14h7l-1 7 9-11h-7z" />',
  archive:
    '<rect x="3" y="5" width="18" height="4" rx="1" /><path d="M5 9v10h14V9" /><path d="M10 13h4" />',
  party:
    '<path d="M4 20 9 7l8 8z" /><path d="m9 7 8 8" stroke-width="1.1" />' +
    '<path d="M14 4v2M19 6l-1.5 1.5M20 11h-2" /><circle cx="12.5" cy="13" r="0.6" fill="currentColor" stroke="none" /><circle cx="15" cy="16" r="0.6" fill="currentColor" stroke="none" />',
  // Ruota della fortuna: cerchio con raggi + mozzo + freccia in alto
  wheel:
    '<circle cx="12" cy="12.5" r="8" />' +
    '<path d="M12 4.5v16M4 12.5h16M6.3 6.8l11.4 11.4M17.7 6.8 6.3 18.2" stroke-width="1.2" />' +
    '<circle cx="12" cy="12.5" r="1.5" fill="currentColor" stroke="none" />' +
    '<path d="M12 2 10.4 4.8h3.2z" fill="currentColor" stroke="none" />',
  // Instagram: corpo fotocamera + obiettivo + flash
  instagram:
    '<rect x="3" y="3" width="18" height="18" rx="5" />' +
    '<circle cx="12" cy="12" r="4" />' +
    '<circle cx="17" cy="7" r="1.1" fill="currentColor" stroke="none" />',
  // TikTok: nota musicale con "coda"
  tiktok:
    '<path d="M14 4v10.5a3.5 3.5 0 1 1-3-3.46" /><path d="M14 4a5 5 0 0 0 5 5" />',
  // Campanello (notifiche)
  bell:
    '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" />',
  // Grafico a barre (statistiche)
  chart:
    '<path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" />',
  // Griglia / dashboard
  grid:
    '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />',
  // Freccia indietro
  'arrow-left':
    '<path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />',
  // Audio on/off (toggle suoni slot)
  'volume-on':
    '<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none" />' +
    '<path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19 6a8.5 8.5 0 0 1 0 12" />',
  'volume-off':
    '<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none" />' +
    '<path d="M16 9.5 21 14.5" /><path d="M21 9.5 16 14.5" />',
  // Controlli player
  play:
    '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />',
  pause:
    '<rect x="7" y="5" width="3.3" height="14" rx="1" fill="currentColor" stroke="none" />' +
    '<rect x="13.7" y="5" width="3.3" height="14" rx="1" fill="currentColor" stroke="none" />',
  // Radio / onde in diretta
  radio:
    '<circle cx="12" cy="13" r="2.1" />' +
    '<path d="M8.6 9.6a5 5 0 0 0 0 6.8M15.4 9.6a5 5 0 0 1 0 6.8" />' +
    '<path d="M6.2 7.2a8.2 8.2 0 0 0 0 11.6M17.8 7.2a8.2 8.2 0 0 1 0 11.6" />',
};

function icon(name, extraClass = '') {
  const inner = PATHS[name];
  if (!inner) return ''; // nome sconosciuto → niente, evita di rompere la pagina
  const cls = ('ico ico-' + name + (extraClass ? ' ' + extraClass : '')).trim();
  return (
    '<svg class="' + cls + '" viewBox="0 0 24 24" ' + P +
    ' aria-hidden="true" focusable="false">' + inner + '</svg>'
  );
}

module.exports = { icon };
