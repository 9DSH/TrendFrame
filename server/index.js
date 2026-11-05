import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { exec } from 'node:child_process';
import { config, ROOT } from './config.js';
import './database/db.js';
import routes from './routes.js';
import analysisRoutes from './analysisRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import aiRoutes from './aiRoutes.js';
import channelRoutes from './channelRoutes.js';
import settingsRoutes from './settingsRoutes.js';
import projectRoutes from './projectRoutes.js';
import systemRoutes from './systemRoutes.js';
import { startScheduler } from './services/scheduler.js';
import footballRoutes from './football/routes.js';

const prod = process.argv.includes('--prod');
const dist = path.join(ROOT, 'dist');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api', routes);
app.use('/api', analysisRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', aiRoutes);
app.use('/api', channelRoutes);
app.use('/api', settingsRoutes);
app.use('/api', projectRoutes);
app.use('/api', systemRoutes);
app.use('/api', footballRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

if (prod) {
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error('No build found. Run "npm run build" first (start.bat does this for you).');
    process.exit(1);
  }
  app.use(express.static(dist));
  // any other page address (for example /topics) gets the app, so refresh and bookmarks work
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(dist, 'index.html')) : next()));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message });
});

// Bound to 127.0.0.1 so the app is reachable only from this PC
const server = app.listen(config.port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${config.port}`;
  console.log(`TrendFrame ${prod ? 'is running at' : 'API running at'} ${url}`);
  startScheduler();
  if (prod && process.argv.includes('--open') && process.platform === 'win32') exec(`start "" "${url}"`);
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${config.port} is already in use. TrendFrame may already be running; open http://127.0.0.1:${config.port}`);
  else console.error(e);
  process.exit(1);
});