// ===================================================================
// FantaSanRocco — TRAGUARDI di «Corri San Rocco»
// -------------------------------------------------------------------
// Ogni traguardo e' una riga della tabella missions con game_key
// valorizzata, cosi' i punti entrano in classifica dalla stessa porta
// delle missioni foto e non c'e' un secondo sistema di punteggio.
// Il server le approva da solo quando la soglia viene raggiunta.
//
// ensureGameMissions() gira a ogni avvio e le ricrea se mancano: e' il
// motivo per cui il seed puo' cancellare tutto senza fare danni.
//
// I punti qui dentro sono tarati: il runner vale ~2.823 punti in tutto,
// quanto i gradi del Jetpack. Cambiarne uno sbilancia i due giochi.
// ===================================================================
const { db } = require('../db');

// Gradi: ogni 3 missioni completate. Ognuno vale punti in classifica.
// La carriera non sale più di grado ogni 3 missioni fisse: le soglie
// crescono, così i primi gradi arrivano presto e gli ultimi sono un
// traguardo vero (62 missioni in tutto, non più 24).
const JP_RANKS = [
  { key: 'jpr-1', grade: 1, stars: 3,  points: 40,  title: 'Jetpack · Aviatore',       desc: 'Completa 3 missioni di carriera su «San Rocco Jetpack».' },
  { key: 'jpr-2', grade: 2, stars: 7,  points: 85,  title: 'Jetpack · Pilota',         desc: 'Completa 7 missioni di carriera su «San Rocco Jetpack».' },
  { key: 'jpr-3', grade: 3, stars: 12, points: 145, title: 'Jetpack · Aviere scelto',  desc: 'Completa 12 missioni di carriera su «San Rocco Jetpack».' },
  { key: 'jpr-4', grade: 4, stars: 18, points: 225, title: 'Jetpack · Asso del cielo', desc: 'Completa 18 missioni di carriera su «San Rocco Jetpack».' },
  { key: 'jpr-5', grade: 5, stars: 26, points: 330, title: 'Jetpack · Angelo custode', desc: 'Completa 26 missioni di carriera su «San Rocco Jetpack».' },
  { key: 'jpr-6', grade: 6, stars: 36, points: 470, title: 'Jetpack · Volo glorioso',  desc: 'Completa 36 missioni di carriera su «San Rocco Jetpack».' },
  { key: 'jpr-7', grade: 7, stars: 48, points: 640, title: 'Jetpack · Leggenda alata', desc: 'Completa 48 missioni di carriera su «San Rocco Jetpack».' },
  { key: 'jpr-8', grade: 8, stars: 62, points: 865, title: 'Jetpack · Santo in cielo', desc: 'Completa 62 missioni di carriera su «San Rocco Jetpack».' },
  // Aggiunti il 13 agosto insieme alle soglie del runner: 62 stelle erano il
  // tetto, e chi ci arrivava non aveva piu' niente davanti. Le missioni di
  // carriera si ripescano dopo essere state completate (il sorteggio esclude
  // solo quelle attive in quel momento), quindi le stelle non si esauriscono
  // e questi due gradi sono raggiungibili: solo lunghi.
  // I passi seguono la curva di prima — 3, 4, 5, 6, 8, 10, 12, 14 stelle — e
  // quindi 16 e 18.
  //
  // I PUNTI (900 e 1.050) sono un compromesso, e vale la pena sapere fra cosa.
  // Controllato prima di scegliere: quattro persone erano ferme esatte a 62
  // stelle — non avevano piu' niente davanti — e una era gia' a 78, quindi il
  // grado 9 le scatta addosso nel momento del deploy, senza giocare un'altra
  // partita. Seguendo la curva sarebbero stati 1.100 e 1.400, ma sarebbe stato
  // quasi un raddoppio del suo punteggio deciso da noi una sera; scendendo a
  // 550 il grado 9 avrebbe pagato MENO dell'8 (865), e un traguardo piu' duro
  // che rende meno del precedente la gente lo nota. 900 e 1.050 tengono la
  // curva in salita senza raddoppiare niente. I mini-giochi arrivano al 61%
  // del valore delle missioni: la festa si vince ancora uscendo di casa, ma
  // il margine si e' ristretto e chi aggiunge la prossima soglia lo sappia.
  { key: 'jpr-9', grade: 9, stars: 78, points: 900, title: 'Jetpack · Custode dei cieli', desc: 'Completa 78 missioni di carriera su «San Rocco Jetpack».' },
  { key: 'jpr-10', grade: 10, stars: 96, points: 1050, title: 'Jetpack · Gloria eterna', desc: 'Completa 96 missioni di carriera su «San Rocco Jetpack».' },
];

// =========================================================================
//  MINI-GIOCO  «Corri San Rocco»  — traguardi che danno punti in automatico
// =========================================================================
// Ogni traguardo è una "missione" (game_key) sbloccata raggiungendo un
// punteggio nel gioco. Al raggiungimento il server inserisce una prova già
// approvata → i punti entrano in classifica come le altre missioni.
const GAME_ACHIEVEMENTS = [
  // NB: le "key" restano quelle storiche (g-50, gp-3…) anche quando la soglia
  // cambia: sono l'identificativo della missione nel database, rinominarle
  // farebbe perdere i traguardi già conquistati dagli utenti.
  // ── Punteggio · base (accessibili a tutti) ───────────────────────
  { key: 'g-run',   metric: 'score', threshold: 1,     points: 8,   title: 'Prima corsa',                 desc: 'Completa la tua prima partita a «Corri San Rocco».' },
  { key: 'g-50',    metric: 'score', threshold: 75,    points: 10,   title: 'In cammino',                  desc: 'Raggiungi 75 punti in una partita.' },
  { key: 'g-120',   metric: 'score', threshold: 200,   points: 15,   title: 'Pellegrino instancabile',     desc: 'Raggiungi 200 punti in una partita.' },
  { key: 'g-250',   metric: 'score', threshold: 400,   points: 20,   title: 'Col cane fino ai fuochi',      desc: 'Raggiungi 400 punti in una partita.' },
  { key: 'g-400',   metric: 'score', threshold: 700,   points: 30,   title: 'Leggenda di Siano',           desc: 'Raggiungi 700 punti in una partita.' },
  // ── Punteggio · avanzati (per chi va lontano) ───────────────────
  { key: 'g-600',   metric: 'score', threshold: 1100,   points: 40,   title: 'Devoto tra i devoti',         desc: 'Raggiungi 1.100 punti in una partita.' },
  { key: 'g-850',   metric: 'score', threshold: 1600,   points: 50,  title: 'Cavaliere di San Rocco',      desc: 'Raggiungi 1.600 punti in una partita.' },
  { key: 'g-1100',  metric: 'score', threshold: 2200,  points: 65,  title: 'Guardiano della processione', desc: 'Raggiungi 2.200 punti in una partita.' },
  { key: 'g-1500',  metric: 'score', threshold: 3000,  points: 80,  title: 'Il Santo corre ancora',       desc: 'Raggiungi 3.000 punti in una partita.' },
  { key: 'g-2000',  metric: 'score', threshold: 4200,  points: 105,  title: 'Immortale come San Rocco',    desc: 'Raggiungi 4.200 punti in una partita.' },
  // ── Punteggio · leggendari (fino a 15.000) ──────────────────────
  { key: 'g-3000',  metric: 'score', threshold: 5800,  points: 140,  title: 'Maratoneta della festa',      desc: 'Raggiungi 5.800 punti in una partita.' },
  { key: 'g-4500',  metric: 'score', threshold: 7800,  points: 175,  title: 'Veglia infinita',             desc: 'Raggiungi 7.800 punti in una partita.' },
  { key: 'g-6000',  metric: 'score', threshold: 10000,  points: 225,  title: 'Patrono dei pellegrini',      desc: 'Raggiungi 10.000 punti in una partita.' },
  { key: 'g-8000',  metric: 'score', threshold: 13000,  points: 280,  title: 'Miracolo di Siano',           desc: 'Raggiungi 13.000 punti in una partita.' },
  { key: 'g-10000', metric: 'score', threshold: 16500, points: 355,  title: 'Santo tra i santi',           desc: 'Raggiungi 16.500 punti in una partita.' },
  { key: 'g-12500', metric: 'score', threshold: 20500, points: 440,  title: 'Eterno camminatore',          desc: 'Raggiungi 20.500 punti in una partita.' },
  { key: 'g-15000', metric: 'score', threshold: 25000, points: 575, title: 'Mito di San Rocco',           desc: 'Raggiungi 25.000 punti in una partita.' },
  // Aggiunte il 13 agosto: 25.000 non bastava piu'. Il migliore era gia' a
  // 21.000 dopo due giorni, e un traguardo che il piu' bravo ha quasi
  // raggiunto smette di essere un traguardo. Il gioco fa ~25 punti al secondo
  // (49 con la reliquia), quindi 30.000 sono una ventina di minuti buoni e
  // 36.000 quasi mezz'ora: difficili, non impossibili.
  // ATTENZIONE: c'e' un tetto assoluto al punteggio in server.js
  // (MAX_PLAUSIBLE_SCORE). Chi alza queste soglie deve alzare anche quello,
  // altrimenti il traguardo resta irraggiungibile per costruzione.
  { key: 'g-18000', metric: 'score', threshold: 30000, points: 700, title: 'Il cammino non finisce',      desc: 'Raggiungi 30.000 punti in una partita.' },
  { key: 'g-22000', metric: 'score', threshold: 36000, points: 900, title: 'Oltre i fuochi',              desc: 'Raggiungi 36.000 punti in una partita.' },
  // ── Partite giocate (più giochi, più punti) ─────────────────────
  { key: 'gp-3',    metric: 'plays', threshold: 5,     points: 8,   title: 'Ci ho preso gusto',           desc: 'Gioca 5 partite a «Corri San Rocco».' },
  { key: 'gp-8',    metric: 'plays', threshold: 15,     points: 12,   title: 'Habitué del cortile',         desc: 'Gioca 15 partite.' },
  { key: 'gp-20',   metric: 'plays', threshold: 35,    points: 22,   title: 'Cliente fisso',               desc: 'Gioca 35 partite.' },
  { key: 'gp-40',   metric: 'plays', threshold: 70,    points: 34,   title: 'Veterano del distributore',   desc: 'Gioca 70 partite.' },
  { key: 'gp-75',   metric: 'plays', threshold: 130,    points: 52,  title: 'Mai una pausa',               desc: 'Gioca 130 partite.' },
  { key: 'gp-150',  metric: 'plays', threshold: 250,   points: 82,  title: 'Inchiodato allo schermo',     desc: 'Gioca 250 partite. Ma quanto giochi?' },
  { key: 'gp-400',  metric: 'plays', threshold: 400,   points: 120, title: 'Ancora una e smetto',         desc: 'Gioca 400 partite.' },
];

// Crea/aggiorna le missioni del gioco allo startup (idempotente).
// ⚠️ CAMBIARE I `points` DI UN TRAGUARDO GIA' ESISTENTE E' RETROATTIVO.
// Qui sotto c'e' una UPDATE: i traguardi sono missioni, e il punteggio in
// classifica si ricalcola ogni volta dal valore ATTUALE della missione. Se si
// abbassa un traguardo da 865 a 400, chi lo aveva gia' conquistato si ritrova
// 465 punti in meno senza che nessuno glielo dica — verificato, non e' una
// supposizione.
// Quindi: si AGGIUNGONO soglie nuove, non si ritoccano quelle vecchie. Se un
// valore va proprio corretto, si decide prima cosa fare con chi lo ha gia'
// preso, e lo si dice a chi gioca.
function ensureGameMissions() {
  const get = db.prepare('SELECT id FROM missions WHERE game_key = ?');
  const ins = db.prepare(`INSERT INTO missions (title, description, points, requires_photo, repeatable, archived, game_key)
                          VALUES (?, ?, ?, 0, 0, 0, ?)`);
  const upd = db.prepare('UPDATE missions SET title = ?, description = ?, points = ? WHERE game_key = ?');
  // Traguardi del runner + gradi del Jetpack: entrambi sono "missioni" con
  // game_key, quindi restano fuori dalle missioni-foto. Inserimento diretto:
  // nessuna notifica parte da qui (il broadcast "Nuova missione!" è solo
  // nella creazione manuale da pannello admin, con la spunta apposita).
  for (const a of GAME_ACHIEVEMENTS.concat(JP_RANKS)) {
    if (get.get(a.key)) upd.run(a.title, a.desc, a.points, a.key);
    else ins.run(a.title, a.desc, a.points, a.key);
  }
}

// È un traguardo già conquistato dall'utente?
function gameMissionId(key) {
  const m = db.prepare('SELECT id FROM missions WHERE game_key = ?').get(key);
  return m ? m.id : null;
}

// Traguardi del gioco con stato done/locked per un utente (per gioco + profilo).
function userGameAchievements(userId) {
  return GAME_ACHIEVEMENTS.map((a) => {
    const mid = userId ? gameMissionId(a.key) : null;
    const done = !!(mid && db.prepare("SELECT 1 FROM submissions WHERE user_id = ? AND mission_id = ? AND status = 'approved'")
      .get(userId, mid));
    return { key: a.key, title: a.title, desc: a.desc, points: a.points, threshold: a.threshold, metric: a.metric, done };
  });
}

module.exports = { GAME_ACHIEVEMENTS, JP_RANKS, ensureGameMissions, gameMissionId, userGameAchievements };
