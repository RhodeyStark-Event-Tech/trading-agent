import { describe, it, expect, vi, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Shared mock for supabase ────────────────────────────────────────────────
// vi.hoisted ensures these variables exist before vi.mock factory runs

const { mockSupabaseChain, mockSupabase } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.gt = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.single = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.upsert = vi.fn(() => chain);
  return {
    mockSupabaseChain: chain,
    mockSupabase: { from: vi.fn(() => chain) },
  };
});

vi.mock('../lib/supabase.js', () => ({ supabase: mockSupabase }));
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../lib/anthropic.js', () => ({
  anthropic: { messages: { create: vi.fn() } },
  AGENT_MODEL: 'claude-sonnet-4-20250514',
  AGENT_MAX_TOKENS: 1000,
}));
vi.mock('../lib/redis.js', () => ({
  redis: { options: { host: 'localhost', port: 6379 } },
  redisConfig: { host: 'localhost', port: 6379 },
}));
vi.mock('../queues/index.js', () => ({
  educationQueue: { add: vi.fn() },
  sentimentQueue: { add: vi.fn() },
  metaQueue: { add: vi.fn() },
  harvestQueue: { add: vi.fn() },
  initQueues: vi.fn(),
}));

// Import routers after mocks
import { signalsRouter } from '../routes/signals.js';
import { tradesRouter } from '../routes/trades.js';
import { positionsRouter } from '../routes/positions.js';
import { harvestRouter } from '../routes/harvest.js';
import { agentsRouter } from '../routes/agents.js';
import { errorHandler } from '../middleware/errorHandler.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/signals', signalsRouter);
  app.use('/api/trades', tradesRouter);
  app.use('/api/positions', positionsRouter);
  app.use('/api/harvest', harvestRouter);
  app.use('/api/agents', agentsRouter);
  app.use(errorHandler);
  return app;
}

let app: express.Express;

beforeAll(() => {
  app = createApp();
});

// Reset mock return values between tests so each test starts clean
import { beforeEach } from 'vitest';
beforeEach(() => {
  // Reset all chain methods to return `this` by default
  for (const key of Object.keys(mockSupabaseChain)) {
    (mockSupabaseChain[key] as ReturnType<typeof vi.fn>).mockReset().mockImplementation(() => mockSupabaseChain);
  }
  mockSupabase.from.mockReset().mockImplementation(() => mockSupabaseChain);
});

// ─── Signals ─────────────────────────────────────────────────────────────────

describe('GET /api/signals', () => {
  it('returns signals list', async () => {
    const signals = [
      { id: '1', ticker: 'AAPL', agent: 'sentiment', action: 'BUY', confidence: 0.9 },
    ];
    mockSupabaseChain.limit.mockResolvedValueOnce({ data: signals, error: null });

    const res = await request(app).get('/api/signals');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(signals);
  });

  it('filters by agent and ticker', async () => {
    // When both agent and ticker are provided, the route chains: from->select->order->limit->eq->eq
    // The last .eq() in the chain is what gets awaited, so mock it to resolve
    let eqCallCount = 0;
    mockSupabaseChain.eq.mockImplementation(() => {
      eqCallCount++;
      if (eqCallCount >= 2) {
        return Promise.resolve({ data: [], error: null });
      }
      return mockSupabaseChain;
    });

    const res = await request(app).get('/api/signals?agent=sentiment&ticker=AAPL');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('caps limit at 200', async () => {
    mockSupabaseChain.limit.mockResolvedValueOnce({ data: [], error: null });

    const res = await request(app).get('/api/signals?limit=999');
    // Zod LimitSchema clamps to max 200
    expect(res.status).toBe(200);
  });
});

describe('GET /api/signals/:id', () => {
  it('returns a single signal', async () => {
    const signal = { id: 'abc', ticker: 'MSFT', agent: 'meta', action: 'HOLD' };
    mockSupabaseChain.single.mockResolvedValueOnce({ data: signal, error: null });

    const res = await request(app).get('/api/signals/abc');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(signal);
  });
});

// ─── Trades ──────────────────────────────────────────────────────────────────

describe('GET /api/trades', () => {
  it('returns trades list', async () => {
    const trades = [{ id: '1', ticker: 'AAPL', action: 'BUY', status: 'filled' }];
    mockSupabaseChain.limit.mockResolvedValueOnce({ data: trades, error: null });

    const res = await request(app).get('/api/trades');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(trades);
  });
});

describe('PATCH /api/trades/:id/status', () => {
  it('updates trade status', async () => {
    const updated = { id: '1', status: 'filled' };
    mockSupabaseChain.single.mockResolvedValueOnce({ data: updated, error: null });

    const res = await request(app)
      .patch('/api/trades/1/status')
      .send({ status: 'filled' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('filled');
  });

  it('rejects invalid status', async () => {
    const res = await request(app)
      .patch('/api/trades/1/status')
      .send({ status: 'invalid_status' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('accepts all valid statuses', async () => {
    for (const status of ['pending', 'filled', 'cancelled', 'rejected']) {
      mockSupabaseChain.single.mockResolvedValueOnce({ data: { id: '1', status }, error: null });
      const res = await request(app)
        .patch('/api/trades/1/status')
        .send({ status });
      expect(res.status).toBe(200);
    }
  });
});

// ─── Positions ───────────────────────────────────────────────────────────────

describe('GET /api/positions', () => {
  it('returns open positions', async () => {
    const positions = [{ id: '1', ticker: 'AAPL', quantity: 10, unrealized_pnl: 50 }];
    mockSupabaseChain.order.mockResolvedValueOnce({ data: positions, error: null });

    const res = await request(app).get('/api/positions');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(positions);
  });
});

describe('GET /api/positions/summary', () => {
  it('returns portfolio summary', async () => {
    mockSupabaseChain.gt.mockResolvedValueOnce({
      data: [
        { unrealized_pnl: 100, quantity: 10, avg_cost: 150 },
        { unrealized_pnl: -30, quantity: 5, avg_cost: 200 },
      ],
      error: null,
    });

    const res = await request(app).get('/api/positions/summary');
    expect(res.status).toBe(200);
    expect(res.body.data.totalUnrealizedPnl).toBe(70);  // 100 + (-30)
    expect(res.body.data.totalPositions).toBe(2);
    expect(res.body.data.totalCostBasis).toBe(2500);     // 10*150 + 5*200
  });
});

// ─── Harvest ─────────────────────────────────────────────────────────────────

describe('GET /api/harvest/config', () => {
  it('returns harvest config', async () => {
    const config = { fixedAmount: 500, pctReturn: 0.05, reservePct: 20, cooldownDays: 7, enabled: false };
    mockSupabaseChain.limit.mockResolvedValueOnce({ data: [config], error: null });

    const res = await request(app).get('/api/harvest/config');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(config);
  });
});

describe('PUT /api/harvest/config', () => {
  it('updates harvest config with valid data', async () => {
    const config = { fixedAmount: 25, pctReturn: 0.1, reservePct: 20, cooldownDays: 7, enabled: true };
    mockSupabaseChain.single.mockResolvedValueOnce({ data: config, error: null });

    const res = await request(app)
      .put('/api/harvest/config')
      .send(config);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects invalid harvest config', async () => {
    const res = await request(app)
      .put('/api/harvest/config')
      .send({ fixedAmount: -100, pctReturn: 5, reservePct: 200, cooldownDays: 0, enabled: true });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/harvest/withdrawals', () => {
  it('returns withdrawal history', async () => {
    const withdrawals = [{ id: '1', status: 'completed', withdrawal_amount: 500 }];
    mockSupabaseChain.order.mockResolvedValueOnce({ data: withdrawals, error: null });

    const res = await request(app).get('/api/harvest/withdrawals');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(withdrawals);
  });
});

describe('POST /api/harvest/confirm/:id', () => {
  it('confirms a withdrawal', async () => {
    const updated = { id: '1', status: 'completed', ach_reference: 'ACH123' };
    mockSupabaseChain.single.mockResolvedValueOnce({ data: updated, error: null });

    const res = await request(app)
      .post('/api/harvest/confirm/1')
      .send({ achReference: 'ACH123' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
  });
});

// ─── Agents ──────────────────────────────────────────────────────────────────

describe('GET /api/agents/status', () => {
  it('returns agent statuses', async () => {
    const statuses = [
      { agent: 'sentiment', status: 'running' },
      { agent: 'meta', status: 'paused' },
    ];
    // The route calls select('*') which resolves directly (no chained .single or .limit)
    mockSupabaseChain.select.mockResolvedValueOnce({ data: statuses, error: null });

    const res = await request(app).get('/api/agents/status');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(statuses);
  });
});

describe('POST /api/agents/:agent/pause', () => {
  it('pauses an agent', async () => {
    mockSupabaseChain.single.mockResolvedValueOnce({
      data: { agent: 'sentiment', status: 'paused' },
      error: null,
    });

    const res = await request(app).post('/api/agents/sentiment/pause');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('paused');
  });
});

describe('POST /api/agents/:agent/resume', () => {
  it('resumes an agent', async () => {
    mockSupabaseChain.single.mockResolvedValueOnce({
      data: { agent: 'sentiment', status: 'running' },
      error: null,
    });

    const res = await request(app).post('/api/agents/sentiment/resume');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('running');
  });
});

describe('POST /api/agents/run/sentiment', () => {
  it('rejects request without headlines', async () => {
    const res = await request(app)
      .post('/api/agents/run/sentiment')
      .send({ tickers: ['AAPL'] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects request without tickers', async () => {
    const res = await request(app)
      .post('/api/agents/run/sentiment')
      .send({ headlines: ['Apple beats earnings'] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
