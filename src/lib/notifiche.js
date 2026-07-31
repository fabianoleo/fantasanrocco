// ===================================================================
// FantaSanRocco — NOTIFICHE PUSH
// -------------------------------------------------------------------
// Web Push con chiavi VAPID. Se le chiavi non sono configurate il
// modulo resta zitto e le notifiche non partono: non e' un errore, e'
// il caso normale in locale.
//
// Un'iscrizione push vale 100 punti (bonus notifiche), tolti se
// l'utente la revoca: reconcileNotifBonus tiene i due lati allineati
// ed e' idempotente, perche' viene chiamata da piu' punti.
//
// Nessun invio deve poter far cadere la richiesta che lo ha scatenato:
// gli errori si mangiano, e le iscrizioni morte (404/410) si cancellano
// da sole invece di riprovare all'infinito.
// ===================================================================
const webpush = require('web-push');
const { db } = require('../db');

// ── Web Push (VAPID) ────────────────────────────────────────────────
const PUSH_ENABLED = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (PUSH_ENABLED) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@fantasanrocco.it',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
} else {
  console.warn('[PUSH] VAPID non configurate (.env) → notifiche disattivate.');
}
function _subObj(row) { return { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }; }

// Bonus notifiche: +100 punti finché l'utente ha ALMENO un'iscrizione push.
// Idempotente: la colonna notif_bonus evita di accreditare due volte, e toglie
// i punti (anche in negativo) quando non resta nessuna iscrizione attiva.
const NOTIF_BONUS = 100;
function reconcileNotifBonus(userId) {
  if (!userId) return 0;
  const u = db.prepare('SELECT notif_bonus FROM users WHERE id = ?').get(userId);
  if (!u) return 0;
  const hasSub = db.prepare('SELECT 1 FROM push_subscriptions WHERE user_id = ? LIMIT 1').get(userId);
  if (hasSub && !u.notif_bonus) {
    db.prepare('UPDATE users SET notif_bonus = 1, points_adjust = points_adjust + ? WHERE id = ?').run(NOTIF_BONUS, userId);
    return NOTIF_BONUS;
  }
  if (!hasSub && u.notif_bonus) {
    db.prepare('UPDATE users SET notif_bonus = 0, points_adjust = points_adjust - ? WHERE id = ?').run(NOTIF_BONUS, userId);
    return -NOTIF_BONUS;
  }
  return 0;
}

function _pushSend(sub, payload) {
  return webpush.sendNotification(sub, JSON.stringify(payload)).catch((err) => {
    // 404/410 = iscrizione scaduta/revocata → rimuovila e ricalcola il bonus
    if (err && (err.statusCode === 404 || err.statusCode === 410)) {
      const row = db.prepare('SELECT user_id FROM push_subscriptions WHERE endpoint = ?').get(sub.endpoint);
      db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint);
      if (row && row.user_id) reconcileNotifBonus(row.user_id);
    }
  });
}
async function pushBroadcast(payload) {
  if (!PUSH_ENABLED) return 0;
  const rows = db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions').all();
  await Promise.all(rows.map((r) => _pushSend(_subObj(r), payload)));
  return rows.length;
}
async function pushToUser(userId, payload) {
  if (!PUSH_ENABLED || !userId) return 0;
  const rows = db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(userId);
  await Promise.all(rows.map((r) => _pushSend(_subObj(r), payload)));
  return rows.length;
}

module.exports = { PUSH_ENABLED, NOTIF_BONUS, reconcileNotifBonus, pushBroadcast, pushToUser };
