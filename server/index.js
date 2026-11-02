import express from 'express';
import { config } from './config.js';
import './database/db.js';
import routes from './routes.js';
import analysisRoutes from './analysisRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import aiRoutes from './aiRoutes.js';


const app = express();
app.use(express.json());
app.use('/api', routes);
app.use('/api', analysisRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', aiRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message });
});

// Bound to 127.0.0.1 so the API is reachable only from this PC
app.listen(config.port, '127.0.0.1', () =>
  console.log(`TrendFrame API running at http://127.0.0.1:${config.port}`)
);