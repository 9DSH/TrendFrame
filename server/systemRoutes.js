import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './database/db.js';
import { config, ROOT } from './config.js';
import { scheduleStatus, saveSchedule } from './services/scheduler.js';

const router = Router();
const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

router.get('/schedule', wrap(() => scheduleStatus()));
router.put('/schedule', wrap((req) => saveSchedule(req.body || {})));

const KEEP_BACKUPS = 10;
router.post('/backup', wrap(async () => {
  const dir = path.join(path.dirname(config.dbPath), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const file = path.join(dir, `trendframe-${stamp}.db`);
  await db.backup(file); // safe while the app is running
  const old = fs.readdirSync(dir).filter((f) => /^trendframe-.*\.db$/.test(f)).sort().reverse().slice(KEEP_BACKUPS);
  for (const f of old) fs.unlinkSync(path.join(dir, f));
  return { file: path.relative(ROOT, file), sizeMb: Math.round((fs.statSync(file).size / 1_048_576) * 10) / 10, kept: KEEP_BACKUPS };
}));

export default router;