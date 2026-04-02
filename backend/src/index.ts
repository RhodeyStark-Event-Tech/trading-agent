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
import { educationRouter } from './routes/education.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/auth.js';
import { initQueues } from './queues/index.js';

// Prevent Redis/BullMQ connection errors from crashing the process
process.on('uncaughtException', (err) => {
  const redisErrors = ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ENOTSOCK', 'Connection is closed'];
  if (redisErrors.some((e) => err.message?.includes(e))) {
    logger.warn({ err: err.message }, 'Redis connection error — queues unavailable');
    return;
  }
  logger.error({ err }, 'Uncaught exception');
  process.exit(1);
});

const app = express();
const PORT = process.env['PORT'] ?? 3001;

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env['FRONTEND_URL'] ?? 'http://localhost:5173' }));
app.use(express.json());

// ─── Rate Limiting ────────────────────────────────────────────────────────────
// General API limit
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, error: 'Too many requests' },
}));

// Strict limit for LLM endpoints (expensive operations)
const llmRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { success: false, error: 'Too many LLM requests — try again in a minute' },
});

// Strict limit for write operations
const writeRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: { success: false, error: 'Too many write requests' },
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), mode: process.env['TRADING_MODE'] ?? 'paper' });
});

// ─── Routes (all protected by auth) ──────────────────────────────────────────
app.use('/api/signals', requireAuth, signalsRouter);
app.use('/api/trades', requireAuth, tradesRouter);
app.use('/api/positions', requireAuth, positionsRouter);
app.use('/api/harvest', requireAuth, writeRateLimit, harvestRouter);
app.use('/api/agents/run', requireAuth, llmRateLimit);
app.use('/api/agents', requireAuth, writeRateLimit, agentsRouter);
app.use('/api/education', requireAuth, educationRouter);

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  logger.info({ port: PORT, mode: process.env['TRADING_MODE'] ?? 'paper' }, 'Backend started');
  try {
    await initQueues();
  } catch {
    logger.warn('Queue initialization failed — running without background workers');
  }
});

export default app;
