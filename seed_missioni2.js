require('dotenv').config();
const { db } = require('./src/db');

const missioni = [
  { title: 'Foto con un bambino vestito da San Rocco', description: 'Trova un bambino travestito da San Rocco (con mantello e bastone) e fotografati insieme.', points: 20, requires_photo: 1 },
  { title: 'Foto con la corona floreale', description: 'Fotografa la corona o le composizioni floreali dedicate a San Rocco.', points: 10, requires_photo: 1 },
  { title: 'Grida "Viva San Rocco!" in pubblico', description: 'Grida la frase a voce alta in mezzo alla gente — fatti fotografare mentre lo fai.', points: 15, requires_photo: 1 },
  { title: 'Foto con le candele votive', description: 'Fotografa le candele accese davanti all\'altare o alla cappella di San Rocco.', points: 10, requires_photo: 1 },
  { title: 'Fai una donazione o offerta', description: 'Lascia un\'offerta durante la funzione o alla raccolta della festa. Foto come ricordo.', points: 15, requires_photo: 1 },
  { title: 'Foto della benedizione', description: 'Cattura il momento della benedizione durante la messa o la processione.', points: 20, requires_photo: 1 },
  { title: 'Trova la bancarella più originale', description: 'Qual è la bancarella più strana o creativa della festa? Fotografala!', points: 10, requires_photo: 1 },
];

const insert = db.prepare(`
  INSERT INTO missions (title, description, points, requires_photo, repeatable)
  VALUES (@title, @description, @points, @requires_photo, @repeatable)
`);

const insertMany = db.transaction((list) => {
  for (const m of list) {
    insert.run({
      title: m.title,
      description: m.description,
      points: m.points,
      requires_photo: m.requires_photo ?? 1,
      repeatable: m.repeatable ?? 0,
    });
  }
});

const countBefore = db.prepare('SELECT COUNT(*) as n FROM missions').get().n;
insertMany(missioni);
const countAfter = db.prepare('SELECT COUNT(*) as n FROM missions').get().n;
console.log(`✅ Missioni aggiunte: ${countAfter - countBefore} (totale: ${countAfter})`);
