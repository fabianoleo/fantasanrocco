// ===================================================================
// FantaSanRocco — REGISTRO delle azioni dello staff
// -------------------------------------------------------------------
// Chi ha approvato, chi ha rifiutato, chi ha toccato i ruoli. Serve a
// rispondere a "chi e' stato" senza doverlo chiedere in giro, e per
// questo non deve mai far cadere l'operazione che sta registrando:
// tutto dentro try/catch, un registro rotto non blocca la festa.
// ===================================================================
const { db } = require('../db');

// ── Audit log: traccia le azioni sensibili dello staff ──────────────────────
function audit(req, action, details) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, nickname, action, details, ip) VALUES (?, ?, ?, ?, ?)')
      .run(req.currentUser ? req.currentUser.id : null, req.currentUser ? req.currentUser.nickname : '—',
        action, details ? String(details).slice(0, 300) : null, (req.ip || '').replace('::ffff:', ''));
  } catch (e) { console.error('[AUDIT]', e.message); }
}

// Voce di registro senza una richiesta dietro (azioni automatiche del server).
function auditSystem(action, details) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, nickname, action, details, ip) VALUES (NULL, ?, ?, ?, ?)')
      .run('sistema', action, details ? String(details).slice(0, 300) : null, '—');
  } catch (e) { console.error('[AUDIT]', e.message); }
}

module.exports = { audit, auditSystem };
