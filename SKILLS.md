# SKILLS.md — AI Stock Trading Agent

A reference guide of all skills, patterns, and domain knowledge required to build and maintain this project. Organized by layer. Use this file to onboard contributors, guide Claude Code sessions, and ensure consistency across the codebase.

---

## 1. Project & Repo Management

### Monorepo Structure
- Use a monorepo with clear separation: `/frontend`, `/backend`, `/python-ms`, `/supabase`
- Package manager: `pnpm workspaces` (preferred for monorepos) or `npm workspaces`
- Shared TypeScript types live in `/packages/types` and are imported by both frontend and backend
- Each workspace has its own `tsconfig.json` extending a root `tsconfig.base.json`

### Environment Management
- Never commit `.env` files — use `.env.example` with all keys documented but no values
- Separate env files per environment: `.env.development`, `.env.production`
- Backend secrets (Anthropic key, Schwab credentials) are server-side only — never referenced in frontend code
- Use Supabase Vault for production secrets where possible

### Git Conventions
- Branch naming: `feature/`, `fix/`, `chore/`, `infra/`
- Commit style: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)
- Never commit directly to `main` — use PRs even solo
- Tag releases with semantic versioning: `v1.0.0`

---

## 2. TypeScript Skills

### General
- Strict mode enabled in all `tsconfig.json` files (`"strict": true`)
- No use of `any` — use `unknown` and narrow with type guards
- Prefer `type` over `interface` for data shapes; use `interface` for extensible contracts
- Use `zod` for runtime validation of all external data (LLM outputs, API responses, webhooks)

### Shared Types Pattern
```typescript
// packages/types/src/signal.ts
export type AgentType = 'sentiment' | 'technical' | 'fundamental' | 'meta';
export type TradeAction = 'BUY' | 'SELL' | 'HOLD';

export type Signal = {
  id: string;
  ticker: string;
  agent: AgentType;
  action: TradeAction;
  confidence: number; // 0.0 - 1.0
  rationale: Record<string, unknown>;
  createdAt: string;
};
```

### Zod Schema Validation (LLM Output)
```typescript
import { z } from 'zod';

export const MetaAgentOutputSchema = z.object({
  action: z.enum(['BUY', 'SELL', 'HOLD']),
  ticker: z.string().min(1).max(5),
  size: z.number().min(0).max(0.05), // max 5% of portfolio
  horizon: z.enum(['intraday', 'swing', 'long']),
  rationale: z.string().min(10),
  confidence: z.number().min(0).max(1),
});

export type MetaAgentOutput = z.infer<typeof MetaAgentOutputSchema>;
```

---

## 3. Node.js / Backend Skills

### Express + TypeScript Setup
- Use `express` with `@types/express`
- Structure routes by domain: `/routes/signals.ts`, `/routes/trades.ts`, `/routes/harvest.ts`
- Use middleware for: auth (Supabase JWT verification), error handling, request logging
- All async route handlers wrapped in a `asyncHandler` utility to catch unhandled rejections

### Error Handling Pattern
```typescript
// Always use a centralized error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

// Wrap async routes
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);
```

### BullMQ Job Queues
- Use BullMQ + Redis for all scheduled and async agent jobs
- Separate queues per agent: `sentiment-queue`, `technical-queue`, `fundamental-queue`, `meta-queue`, `harvest-queue`
- Always define job retry logic and failure handlers
- Use `QueueScheduler` for delayed/recurring jobs

```typescript
import { Queue, Worker } from 'bullmq';

const sentimentQueue = new Queue('sentiment', { connection: redisConfig });

// Add job
await sentimentQueue.add('analyze', { tickers: ['AAPL', 'NVDA'] }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
});
```

### Python Microservice Bridge
- Python microservice runs as a separate process on a known port (e.g. `8001`)
- Node calls it via HTTP using `fetch` or `axios`
- Always validate responses with Zod before using in Node
- Python service handles: Schwab API auth, market data streaming, `ta-lib` indicator computation

---

## 4. Anthropic / LLM Skills

### Claude API Usage
- Always use model: `claude-sonnet-4-20250514`
- Set `max_tokens: 1000` for signal agents (outputs are structured JSON, not prose)
- Use structured system prompts — store in DB for versioning, load at runtime
- Always parse and validate LLM output with Zod before acting on it

### Agent Prompt Pattern
```typescript
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1000,
  system: systemPrompt, // loaded from DB
  messages: [
    {
      role: 'user',
      content: `Analyze the following data and respond ONLY with a valid JSON object matching this schema:
      { action, ticker, confidence, rationale }
      
      Data: ${JSON.stringify(inputData)}`
    }
  ]
});

// Extract and validate
const raw = response.content[0].type === 'text' ? response.content[0].text : '';
const cleaned = raw.replace(/```json|```/g, '').trim();
const parsed = MetaAgentOutputSchema.parse(JSON.parse(cleaned));
```

### LLM Cost Management
- Log every API call: input tokens, output tokens, latency, model, agent type
- Set per-agent token budgets — alert if an agent consistently exceeds budget
- Cache news/fundamental summaries in Redis (TTL: 15 min) to avoid redundant LLM calls
- Rate limit LLM calls in high-frequency scenarios — use BullMQ rate limiter

### Prompt Versioning
- Store prompts in `agent_prompts` Supabase table with `version` field
- Load active prompt at runtime: `SELECT * FROM agent_prompts WHERE agent = $1 AND active = true`
- Never hardcode prompts in source code — makes iteration and A/B testing possible

---

## 5. Supabase Skills

### Client Setup
```typescript
// backend — use service role key (never expose to frontend)
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

// frontend — use anon key + RLS
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
```

### Row Level Security (RLS)
- Enable RLS on all tables
- Backend uses service role key (bypasses RLS) — only for trusted server-side operations
- Frontend uses anon key — RLS policies control what is readable/writable
- Never expose service role key to frontend or client-side code

### Real-time Subscriptions (Frontend)
```typescript
const channel = supabase
  .channel('signals')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, (payload) => {
    // Update UI with new signal
    setSignals(prev => [payload.new as Signal, ...prev]);
  })
  .subscribe();

// Always clean up on unmount
return () => { supabase.removeChannel(channel); };
```

### Migrations
- All schema changes via Supabase migration files in `/supabase/migrations/`
- Never modify schema directly in Supabase Studio in production
- Use `supabase db push` for local dev, CI/CD pipeline for production
- Always write rollback migrations alongside forward migrations

### pgvector (Semantic Search)
```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column
ALTER TABLE news_cache ADD COLUMN embedding vector(1536);

-- Similarity search
SELECT * FROM news_cache
ORDER BY embedding <=> $1  -- cosine distance
LIMIT 10;
```

---

## 6. React / Frontend Skills

### Project Structure
```
/frontend/src
  /components       # Reusable UI components
  /pages            # Route-level page components
  /hooks            # Custom React hooks (useSignals, useTrades, usePositions)
  /stores           # Zustand stores
  /lib              # Supabase client, API helpers
  /types            # Re-exported from shared packages/types
```

### Data Fetching Pattern
- Use React Query (`@tanstack/react-query`) for all server state
- Use Zustand for local UI state (e.g. selected ticker, dashboard filters)
- Real-time data via Supabase subscriptions — update React Query cache on new events

```typescript
// Custom hook pattern
export const useSignals = () => {
  return useQuery({
    queryKey: ['signals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Signal[];
    },
  });
};
```

### Charts
- Use **TradingView Lightweight Charts** for OHLCV candlestick charts
- Use **Recharts** for P&L curves, signal confidence histograms, withdrawal history
- Always memoize chart data with `useMemo` to avoid unnecessary re-renders

### Dashboard Key Views
1. **Positions Panel** — live positions, unrealized P&L, per-position stop-loss status
2. **Signal Feed** — real-time agent signals with expandable LLM rationale
3. **Trade History** — filled orders, entry/exit prices, realized P&L per trade
4. **Harvest Panel** — current realized P&L vs threshold, withdrawal history, config controls
5. **Agent Control** — pause/resume per agent, paper vs live mode toggle, prompt viewer

---

## 7. Python Microservice Skills

### Schwab API (`schwab-py`)
- Auth flow: OAuth2 PKCE — handle token refresh automatically
- Store tokens securely — never in source code
- Key capabilities used:
  - `client.get_quotes()` — real-time quotes
  - `client.get_price_history()` — OHLCV data
  - `client.place_order()` — bracket orders with stop-loss/take-profit
  - `client.get_accounts()` — account balance and positions

### Technical Indicators (`ta-lib`)
- Compute indicators server-side in Python (ta-lib is most reliable in Python)
- Expose via REST endpoint: `POST /indicators` with OHLCV payload
- Key indicators: RSI, MACD, Bollinger Bands, VWAP, EMA(9), EMA(21), ATR
- Return as JSON for Node.js consumption

### FastAPI Setup (Python MS)
```python
from fastapi import FastAPI
app = FastAPI()

@app.post("/indicators")
async def compute_indicators(payload: OHLCVPayload):
    # compute with ta-lib
    return { "rsi": ..., "macd": ..., "bb_upper": ..., "bb_lower": ... }

@app.post("/orders")
async def place_order(payload: OrderPayload):
    # place via schwab-py
    return { "order_id": ..., "status": "submitted" }
```

---

## 8. Risk Management Skills

### Position Sizing
- Default: Fixed fractional — risk max 1% of portfolio per trade
- Size = (Portfolio Value × Risk %) / (Entry Price - Stop Loss Price)
- Never exceed 5% of portfolio in a single position

### Order Types
- Always use **bracket orders** (entry + stop-loss + take-profit in one order)
- Stop-loss: 2% below entry (long) / 2% above entry (short)
- Take-profit: 4–6% above entry (2:1 risk/reward minimum)

### Circuit Breaker Logic
```typescript
const checkCircuitBreaker = async () => {
  const dailyPnL = await getDailyRealizedPnL();
  const portfolioValue = await getPortfolioValue();
  const drawdownPct = Math.abs(dailyPnL) / portfolioValue;

  if (dailyPnL < 0 && drawdownPct >= 0.03) { // -3% daily drawdown
    await pauseAllAgents();
    await sendAlert('🚨 Circuit breaker triggered — trading paused');
  }
};
```

---

## 9. Profit Harvesting Skills

### Threshold Evaluation Logic
```typescript
const evaluateHarvest = async (config: HarvestConfig) => {
  const realizedPnL = await getRealizedPnLSinceLastHarvest();
  const portfolioValue = await getPortfolioValue();
  const pctReturn = realizedPnL / portfolioValue;
  const daysSinceLast = await getDaysSinceLastWithdrawal();

  // Check cooldown
  if (daysSinceLast < config.cooldownDays) return;

  // Check either threshold
  const fixedTriggered = realizedPnL >= config.fixedAmount;
  const pctTriggered = pctReturn >= config.pctReturn;

  if (fixedTriggered || pctTriggered) {
    const triggerType = fixedTriggered ? 'fixed' : 'percentage';
    await initiateHarvestNotification(realizedPnL, portfolioValue, triggerType, config);
  }
};
```

### Reserve Calculation
```typescript
const calculateWithdrawalAmount = (realizedPnL: number, portfolioValue: number, reservePct: number) => {
  const minReserve = portfolioValue * (reservePct / 100);
  const availableCash = portfolioValue - minReserve;
  // Only withdraw realized gains, never touch reserve
  return Math.min(realizedPnL, availableCash);
};
```

### Webhook Notification Payload
```typescript
// Sent to Slack / email when harvest triggers
const notificationPayload = {
  event: 'HARVEST_TRIGGERED',
  triggerType: 'fixed' | 'percentage',
  realizedPnL: number,
  withdrawalAmount: number,
  reserveRetained: number,
  portfolioValueAtTrigger: number,
  instructions: 'Please initiate ACH transfer of $X via Schwab dashboard',
  confirmationUrl: `${BASE_URL}/api/harvest/confirm/${withdrawalId}`,
};
```

### Manual Confirmation Flow
- Webhook fires with withdrawal amount and a confirmation link
- User initiates transfer manually in Schwab
- User clicks confirmation link (or uses dashboard) to mark withdrawal as `completed`
- Enter ACH reference ID manually for record keeping
- P&L baseline resets only after confirmation

---

## 10. Monitoring & Observability Skills

### Logging
- Use `pino` for structured JSON logging in Node.js
- Log levels: `debug` (dev only), `info`, `warn`, `error`
- Always include: `timestamp`, `agent`, `ticker`, `action`, `latency_ms` in agent logs
- Ship logs to a log aggregator (Logtail, Datadog, or CloudWatch)

### Alerting (Slack Webhook)
- Critical alerts: circuit breaker trigger, order failure, agent crash, harvest trigger
- Daily summary: P&L, signals generated, trades executed, LLM cost
- Use structured Slack Block Kit messages for readability

### Key Metrics to Track
| Metric | Description |
|---|---|
| `agent.latency_ms` | LLM call duration per agent |
| `agent.token_usage` | Input + output tokens per call |
| `trade.win_rate` | % of profitable closed trades |
| `trade.avg_pnl` | Average P&L per trade |
| `portfolio.daily_pnl` | Daily realized + unrealized P&L |
| `harvest.total_withdrawn` | Cumulative amount harvested |
| `risk.drawdown_pct` | Current drawdown from peak |

---

## 11. Security Skills

### API Security
- All backend routes protected by Supabase JWT middleware
- Rate limit all API endpoints (use `express-rate-limit`)
- Validate and sanitize all inputs — never pass raw user input to SQL or LLM prompts
- Use HTTPS everywhere — no HTTP in production

### Secrets Hygiene
- Rotate Schwab OAuth tokens automatically via `schwab-py` token refresh
- Anthropic API key: backend only, never logged, never in responses
- Supabase service key: backend only — anon key for frontend
- Audit secret access quarterly

### Prompt Injection Defense
- Never interpolate raw user input directly into LLM prompts
- Wrap user-provided content in clear delimiters: `<user_input>...</user_input>`
- Validate all LLM outputs with Zod before acting on them — treat LLM as untrusted input source

---

## 12. Testing Skills

### Backend Testing
- Use `vitest` for unit tests
- Test all Zod schemas with valid and invalid inputs
- Test risk management logic (position sizing, circuit breaker) with edge cases
- Mock Anthropic API and Schwab API in tests — never hit real APIs in CI

### Frontend Testing
- Use `vitest` + `@testing-library/react` for component tests
- Test all data hooks with mocked Supabase responses
- E2E testing with Playwright for critical flows (dashboard loads, harvest confirmation)

### Backtesting
- Replay historical price data + news through agent pipeline
- Use `vectorbt` or `backtrader` for strategy performance metrics
- Key metrics: Sharpe ratio, max drawdown, win rate, avg R:R ratio
- Always backtest before promoting any strategy change to live

---

## 13. Deployment Skills

### Recommended Stack
- **Frontend**: Vercel (zero-config for Vite/React)
- **Backend (Node)**: Railway or Render (easy Docker deploys, built-in Redis)
- **Python MS**: Railway (separate service, same project)
- **Database**: Supabase (managed Postgres)
- **Redis**: Upstash (serverless Redis, pairs well with Railway/Vercel)

### CI/CD
- GitHub Actions for CI: lint → typecheck → test → build
- Auto-deploy `main` to production, `develop` to staging
- Run Supabase migrations as part of deployment pipeline
- Never deploy if tests fail

### Health Checks
- `/health` endpoint on Node backend and Python MS
- Uptime monitoring via BetterUptime or similar
- Alert on: service down, high latency, job queue backlog > threshold
