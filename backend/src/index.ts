import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from './lib/logger.js';
import { signalsRouter } from './routes/signals.js';
import { tradesRouter } from './routes/trades.js';
import { positionsRouter } from './routes/positions.js';
import { harvestRouter } from './routes/harvest.js';
import { agentsRouter } from './routes/agents.js';
import { errorHandler } from './middleware/errorHandler.js';
import { initQueues } from './queues/index.js';

const app = express();
const PORT = process.env['PORT'] ?? 3001;

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env['FRONTEND_URL'] ?? 'http://localhost:5173' }));
app.use(express.json());

// ─── Rate Limiting ────────────────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, error: 'Too many requests' },
}));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), mode: process.env['TRADING_MODE'] ?? 'paper' });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/signals', signalsRouter);
app.use('/api/trades', tradesRouter);
app.use('/api/positions', positionsRouter);
app.use('/api/harvest', harvestRouter);
app.use('/api/agents', agentsRouter);

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  logger.info({ port: PORT, mode: process.env['TRADING_MODE'] ?? 'paper' }, 'Backend started');
  await initQueues();
});

export default app;
