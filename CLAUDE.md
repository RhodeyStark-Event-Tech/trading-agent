# AI Stock Trading Agent — Project Brief

## Overview
An automated stock trading system powered by LLM-based signal generation. The system ingests market data, news, and fundamentals, processes them through specialized AI agents, and executes trades via the Schwab API — with a React/TypeScript dashboard for monitoring and control.

---

## Goals
- Use Claude (claude-sonnet-4-20250514) as the core signal engine across multiple trading strategies
- Support multi-timeframe trading: intraday, swing, and long-term
- Generate signals from three sources: sentiment/news, technical patterns, and fundamentals
- Execute trades through TD Ameritrade / Schwab API with strict risk guardrails
- Provide a real-time React dashboard for monitoring positions, signals, and agent reasoning

---

## Tech Stack

### Frontend
- **Framework**: React + TypeScript (Vite)
- **Styling**: Tailwind CSS
- **State Management**: Zustand or React Query
- **Charts**: Recharts or TradingView Lightweight Charts
- **Real-time updates**: Supabase real-time subscriptions

### Middleware / Backend
- **Runtime**: Node.js (TypeScript)
- **Framework**: Express or Fastify
- **LLM Orchestration**: Anthropic SDK (`@anthropic-ai/sdk`)
- **Scheduling**: Node-cron or BullMQ (for job queues)
- **Broker Integration**: `schwab-py` via Python microservice (called from Node)

### Database
- **Primary DB**: Supabase (PostgreSQL)
  - Trades, positions, signals, agent rationales
  - `jsonb` columns for raw LLM outputs and news blobs
  - `pgvector` for semantic search over historical signals/news
  - Real-time subscriptions for live dashboard updates
- **Cache / Real-time state**: Redis (via Upstash or self-hosted)

### Infrastructure
- **Hosting**: TBD (Railway, Render, or AWS)
- **Monitoring**: Grafana + alerts via Slack/Discord webhook
- **Secrets management**: `.env` + Supabase Vault

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React / TypeScript                    │
│         Dashboard: positions, signals, agent logs        │
└───────────────────────┬─────────────────────────────────┘
                        │ REST + WebSocket
┌───────────────────────▼─────────────────────────────────┐
│                  Node.js Middleware                      │
│     API routes, agent orchestration, risk engine         │
└──────┬──────────────────────────────┬────────────────────┘
       │                              │
┌──────▼──────┐               ┌───────▼──────┐
│  Anthropic  │               │  Schwab API  │
│  Claude API │               │  (Python MS) │
│  (Agents)   │               │  Data + Orders│
└──────┬──────┘               └───────┬──────┘
       │                              │
┌──────▼──────────────────────────────▼──────┐
│               Supabase (Postgres)           │
│  trades | signals | positions | news_cache  │
└─────────────────────────────────────────────┘
```

---

## LLM Agent Pipeline

### Agent 1 — Sentiment Agent
- **Input**: News headlines, SEC filings, earnings transcripts
- **Output**: `{ sentiment: "bullish"|"bearish"|"neutral", confidence: 0-1, tickers: [], rationale: string }`
- **Trigger**: On new news events + hourly sweep

### Agent 2 — Technical Agent
- **Input**: OHLCV data + computed indicators (RSI, MACD, BB, VWAP)
- **Output**: `{ pattern: string, signal: "buy"|"sell"|"hold", entry: number, rationale: string }`
- **Trigger**: Every 15 minutes (intraday) + daily close

### Agent 3 — Fundamental Agent
- **Input**: P/E, EPS, revenue growth, earnings call summaries
- **Output**: `{ fair_value: number, catalyst: string, horizon: "swing"|"long", rationale: string }`
- **Trigger**: On earnings events + weekly sweep

### Agent 4 — Meta Agent (Synthesizer)
- **Input**: Outputs from Agents 1–3
- **Output**: `{ action: "BUY"|"SELL"|"HOLD", ticker: string, size: number, horizon: string, rationale: string }`
- **Rule**: Meta agent output is JSON only — deterministic Node.js code handles execution

---

## Risk Management Rules (Non-negotiable)
- LLM agents produce signals only — they never call the broker API directly
- All LLM output is validated against a strict JSON schema before any action
- Max position size: 5% of portfolio per trade
- Hard stop-loss: 2% per position
- Daily drawdown circuit breaker: pause all trading if daily P&L < -3%
- Max open positions: 10 concurrent
- Paper trade mode must be validated before live trading

---

## Profit Harvesting Engine

Automatically transfers realized profits to a linked bank account via ACH when configurable thresholds are met.

### Trigger Logic
A withdrawal is initiated when **either** condition is met first:
- **Fixed threshold**: Realized profit since last withdrawal exceeds `HARVEST_FIXED_AMOUNT` (e.g. $500)
- **Percentage threshold**: Realized return since last withdrawal exceeds `HARVEST_PCT_RETURN` (e.g. 5%)

Both thresholds are user-configurable via the dashboard and stored in the `harvest_config` table.

### Withdrawal Flow
```
1. Harvest Evaluator runs on schedule (e.g. daily at market close)
2. Check realized P&L since last withdrawal against both thresholds
3. If triggered → validate all safeguards (see below)
4. Calculate withdrawal amount (realized gains minus reserve buffer)
5. Fire webhook notification (Slack/email) with full transfer breakdown and amount
6. User manually initiates ACH transfer in Schwab UI
7. Log to `withdrawals` table with status `notified`
8. User confirms completion → status updated to `completed` via dashboard
9. Reset realized P&L baseline for next harvest cycle
```

### Safeguards
- **Minimum reserve**: Always retain at least `RESERVE_PCT`% of total account value (e.g. 20%) — withdrawal amount is capped to never breach this floor
- **Realized gains only**: Withdrawal amount is calculated strictly from closed/settled trades — open unrealized positions are never counted
- **Cooldown period**: Minimum `HARVEST_COOLDOWN_DAYS` days between withdrawals (e.g. 7 days) to prevent over-extraction during volatile periods
- **No manual approval required**: Fully automated, but every withdrawal triggers an immediate notification with full breakdown

### Configuration (all user-adjustable via dashboard)
| Setting | Default | Description |
|---|---|---|
| `HARVEST_FIXED_AMOUNT` | $500 | Fixed dollar profit threshold |
| `HARVEST_PCT_RETURN` | 5% | Percentage return threshold |
| `RESERVE_PCT` | 20% | Minimum % of account to always retain |
| `HARVEST_COOLDOWN_DAYS` | 7 | Minimum days between withdrawals |
| `HARVEST_ENABLED` | false | Master on/off switch (default off until live mode) |

### Database Schema — `harvest_config`
| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| fixed_amount | float | Fixed dollar trigger threshold |
| pct_return | float | Percentage return trigger threshold |
| reserve_pct | float | Minimum account reserve percentage |
| cooldown_days | int | Minimum days between withdrawals |
| enabled | boolean | Master switch |
| updated_at | timestamptz | Last config change |

### Database Schema — `withdrawals`
| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| trigger_type | text | `fixed` or `percentage` (whichever fired) |
| realized_pnl_at_trigger | float | Total realized P&L at time of withdrawal |
| withdrawal_amount | float | Actual amount transferred |
| account_value_at_trigger | float | Total account value at time of withdrawal |
| reserve_retained | float | Amount kept in account as reserve |
| ach_reference | text | Manual ACH reference ID (entered by user after transfer) |
| status | text | `notified` / `completed` / `cancelled` |
| created_at | timestamptz | Withdrawal timestamp |

---

## Database Schema (Supabase)

### `signals`
| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| ticker | text | Stock symbol |
| agent | text | sentiment / technical / fundamental / meta |
| action | text | BUY / SELL / HOLD |
| confidence | float | 0.0 – 1.0 |
| rationale | jsonb | Full LLM reasoning output |
| created_at | timestamptz | Signal timestamp |

### `trades`
| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| signal_id | uuid | FK → signals |
| ticker | text | Stock symbol |
| action | text | BUY / SELL |
| quantity | int | Shares |
| price | float | Execution price |
| status | text | pending / filled / cancelled |
| created_at | timestamptz | Order timestamp |

### `positions`
| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| ticker | text | Stock symbol |
| quantity | int | Current shares held |
| avg_cost | float | Average cost basis |
| unrealized_pnl | float | Current unrealized P&L |
| updated_at | timestamptz | Last updated |

### `news_cache`
| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| ticker | text | Related stock symbol |
| headline | text | News headline |
| source | text | News source |
| raw | jsonb | Full raw news payload |
| embedding | vector | pgvector embedding for semantic search |
| published_at | timestamptz | Publication time |

---

## Development Phases

### Phase 1 — Foundation
- [ ] Supabase project setup + schema migration
- [ ] Schwab API auth + paper trading mode
- [ ] Node.js project scaffold (TypeScript + Express)
- [ ] React + TypeScript frontend scaffold (Vite + Tailwind)

### Phase 2 — Data Pipeline
- [ ] Schwab market data streaming (quotes, OHLCV)
- [ ] News ingestion (NewsAPI or Benzinga)
- [ ] Technical indicator computation (ta-lib via Python or technicalindicators npm)
- [ ] Redis caching layer

### Phase 3 — LLM Agent Engine
- [ ] Sentiment Agent implementation
- [ ] Technical Agent implementation
- [ ] Fundamental Agent implementation
- [ ] Meta Agent + JSON schema validation

### Phase 4 — Execution + Risk
- [ ] Order placement via Schwab API
- [ ] Risk management engine (position sizing, stop-loss, circuit breaker)
- [ ] Trade logging to Supabase
- [ ] Profit harvesting engine (threshold evaluation, safeguard checks, webhook trigger)
- [ ] Webhook/Slack notification with transfer amount breakdown + manual confirmation flow

### Phase 5 — Dashboard
- [ ] Real-time positions view
- [ ] Signal feed with LLM rationale
- [ ] Trade history + P&L charts
- [ ] Agent control panel (pause/resume, paper vs live toggle)
- [ ] Profit harvesting config panel (set thresholds, reserve %, cooldown)
- [ ] Withdrawal history view with ACH status tracking

### Phase 6 — Hardening
- [ ] Backtesting framework
- [ ] Monitoring + alerting (Grafana / Slack)
- [ ] Error handling + retry logic
- [ ] Security audit

---

## Key Constraints
- Never expose Anthropic or Schwab API keys to the frontend
- All agent calls are server-side (Node.js middleware)
- LLM is a signal source, not an executor — strict separation of concerns
- Paper trading must be the default mode; live requires explicit opt-in flag

---

## Notes
- Use `claude-sonnet-4-20250514` for all agent calls (best balance of speed + reasoning)
- Prompt each agent with structured system prompts — store prompts in DB for versioning
- Log every LLM call (input + output + latency + cost) for debugging and optimization
