// ===================================================================
// FantaSanRocco — POSTA in uscita
// -------------------------------------------------------------------
// Serve solo al recupero password. La configurazione arriva
// dall'ambiente: Gmail se c'e' EMAIL_USER, SMTP completo se c'e'
// SMTP_HOST, altrimenti niente e il link si mostra a schermo.
// ===================================================================
const nodemailer = require('nodemailer');

// Crea un transporter nodemailer.
// Priorità: se EMAIL_USER è impostato usa Gmail (semplice per Render).
// Se invece SMTP_HOST è impostato usa configurazione SMTP completa.
// Altrimenti dev-mode: il link viene stampato in console.
function makeMailTransporter() {
  if (process.env.EMAIL_USER) {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return null;
}

module.exports = { makeMailTransporter };
