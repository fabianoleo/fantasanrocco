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

// Il mittente come lo vede chi riceve. Il nome visibile non e' un vezzo:
// una casella che arriva come indirizzo nudo ("fantasanrocco@gmail.com")
// e' il profilo tipico della posta automatica sospetta, e i filtri la
// pesano. Con il nome davanti si legge "FantaSanRocco" e basta.
// NOME_MITTENTE fra virgolette perche' senza, un nome con spazi o punti
// romperebbe l'intestazione.
function mittente() {
  const indirizzo = process.env.SMTP_FROM || process.env.EMAIL_USER || process.env.SMTP_USER;
  if (!indirizzo) return undefined;
  // Se SMTP_FROM e' gia' scritto in forma completa ("Tizio <a@b.it>"),
  // si lascia stare: chi l'ha configurato sapeva quello che faceva.
  if (indirizzo.includes('<')) return indirizzo;
  return `"FantaSanRocco" <${indirizzo}>`;
}

// Dove finiscono le risposte. Una mail a cui non si puo' rispondere e' un
// altro segnale che i filtri contano: qui la risposta arriva alla casella
// dello staff, che e' una cosa vera.
function rispondiA() {
  return process.env.EMAIL_REPLY_TO || process.env.EMAIL_USER || process.env.SMTP_USER || undefined;
}

module.exports = { makeMailTransporter, mittente, rispondiA };
