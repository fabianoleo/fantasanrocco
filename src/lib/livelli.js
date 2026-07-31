// ===================================================================
// FantaSanRocco — I DIECI LIVELLI
// -------------------------------------------------------------------
// Soglie e nomi, piu' il calcolo del livello a partire dai punti.
// Funzione pura: non tocca il database. La notifica di passaggio di
// livello resta in server.js, perche' quella manda una push.
// ===================================================================

// ── Livelli utente (in base ai punti totali) ────────────────────────────
const LEVELS = [
  { lv: 1,  title: 'Pellegrino',             at: 0 },
  { lv: 2,  title: 'Devoto',                 at: 60 },
  { lv: 3,  title: 'Fedele',                 at: 180 },
  { lv: 4,  title: 'Portatore di cero',      at: 400 },
  { lv: 5,  title: 'Cavaliere di San Rocco', at: 750 },
  { lv: 6,  title: 'Guardiano della festa',  at: 1300 },
  { lv: 7,  title: 'Veterano del Palio',     at: 2200 },
  { lv: 8,  title: 'Maestro dei fuochi',     at: 3600 },
  { lv: 9,  title: 'Leggenda di Siano',      at: 5500 },
  { lv: 10, title: 'Santo tra i santi',      at: 8500 },
];
function userLevel(points) {
  points = Math.max(0, points || 0);
  let cur = LEVELS[0];
  for (const l of LEVELS) { if (points >= l.at) cur = l; else break; }
  const next = LEVELS.find((l) => l.at > points) || null;
  const span = next ? (next.at - cur.at) : 1;
  const into = Math.max(0, points - cur.at);
  return {
    level: cur.lv, title: cur.title, points,
    nextAt: next ? next.at : null, nextTitle: next ? next.title : null,
    toNext: next ? (next.at - points) : 0,
    progress: next ? Math.min(100, Math.round(into / span * 100)) : 100,
    max: !next,
  };
}

module.exports = { LEVELS, userLevel };
