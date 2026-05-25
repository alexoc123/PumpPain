const { getDb } = require('./database');
const db = getDb();
const r1 = db.prepare("DELETE FROM prices WHERE reporter_hash = 'seed'").run();
const r2 = db.prepare("DELETE FROM stations WHERE osm_id LIKE 'demo/%'").run();
console.log(`Deleted ${r1.changes} seed prices and ${r2.changes} seed stations.`);
