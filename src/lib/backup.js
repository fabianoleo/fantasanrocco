// ===================================================================
// FantaSanRocco — BACKUP del database
// -------------------------------------------------------------------
// Una copia del file .db, tenuta a rotazione. Gira all'avvio, a
// intervalli, e prima di ogni operazione distruttiva: e' la rete sotto
// al reset del gioco.
// ===================================================================
const fs = require('fs');
const path = require('path');
const { db, BACKUPS_DIR } = require('../db');

// ── Backup automatico del database (copia locale a rotazione) ──────────────
// Usa l'API di backup online di SQLite (sicura anche con WAL e scritture in
// corso): produce un file .db consistente senza bloccare il sito.
const BACKUP_KEEP = 30;                       // quanti snapshot tenere
const BACKUP_EVERY_MS = 6 * 60 * 60 * 1000;   // ogni 6 ore
function runBackup(reason) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `backup-${stamp}${reason ? '-' + reason : ''}.db`;
  const dest = path.join(BACKUPS_DIR, file);
  return db.backup(dest)
    .then(() => {
      // Rotazione: tiene solo gli ultimi BACKUP_KEEP file
      const files = fs.readdirSync(BACKUPS_DIR)
        .filter((f) => f.endsWith('.db'))
        .map((f) => ({ f, t: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      files.slice(BACKUP_KEEP).forEach(({ f }) => { try { fs.unlinkSync(path.join(BACKUPS_DIR, f)); } catch (e) {} });
      console.log(`[BACKUP] creato ${file}`);
      return file;
    })
    .catch((err) => { console.error('[BACKUP] fallito:', err.message); return null; });
}

// Chi possiede la cadenza dei backup e' questo modulo, non chi lo importa:
// tenendo la costante qui e il setInterval altrove, spostare il file lasciava
// indietro il valore. Si avvia una volta sola dal server.
function avviaBackupPeriodici() {
  runBackup('avvio');                        // uno subito, all'accensione
  return setInterval(() => runBackup(), BACKUP_EVERY_MS);
}

module.exports = { runBackup, avviaBackupPeriodici, BACKUP_EVERY_MS };
