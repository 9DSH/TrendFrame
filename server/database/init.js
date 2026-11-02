import { db } from './db.js';
import { config } from '../config.js';

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all();
console.log(`Database ready at ${config.dbPath}\n`);
for (const { name } of tables) {
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get();
  console.log(`  ${name.padEnd(18)} ${n} rows`);
}