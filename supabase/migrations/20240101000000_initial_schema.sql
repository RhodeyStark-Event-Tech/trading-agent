-- ─── Extensions ─────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector SCHEMA extensions;

-- ─── Signals ─────────────────────────────────────────────────────────────────
CREATE TABLE signals (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticker       TEXT NOT NULL,
  agent        TEXT NOT NULL CHECK (agent IN ('sentiment', 'technical', 'fundamental', 'meta')),
  action       TEXT NOT NULL CHECK (action IN ('BUY', 'SELL', 'HOLD')),
  confidence   FLOAT NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  rationale    JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signals_ticker    ON signals (ticker);
CREATE INDEX idx_signals_agent     ON signals (agent);
CREATE INDEX idx_signals_created   ON signals (created_at DESC);

ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signals_read" ON signals FOR SELECT USING (true);

-- ─── Trades ──────────────────────────────────────────────────────────────────
CREATE TABLE trades (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  signal_id    UUID REFERENCES signals (id) ON DELETE SET NULL,
  ticker       TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('BUY', 'SELL')),
  quantity     INT NOT NULL CHECK (quantity > 0),
  price        FLOAT NOT NULL CHECK (price > 0),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'cancelled', 'rejected')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trades_ticker    ON trades (ticker);
CREATE INDEX idx_trades_status    ON trades (status);
CREATE INDEX idx_trades_created   ON trades (created_at DESC);

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trades_read" ON trades FOR SELECT USING (true);

-- ─── Positions ────────────────────────────────────────────────────────────────
CREATE TABLE positions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticker          TEXT NOT NULL UNIQUE,
  quantity        INT NOT NULL DEFAULT 0,
  avg_cost        FLOAT NOT NULL DEFAULT 0,
  unrealized_pnl  FLOAT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "positions_read" ON positions FOR SELECT USING (true);

-- ─── News Cache ───────────────────────────────────────────────────────────────
CREATE TABLE news_cache (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticker        TEXT,
  headline      TEXT NOT NULL,
  source        TEXT,
  raw           JSONB NOT NULL DEFAULT '{}',
  embedding     vector(1536),
  published_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_news_ticker     ON news_cache (ticker);
CREATE INDEX idx_news_published  ON news_cache (published_at DESC);
CREATE INDEX idx_news_embedding  ON news_cache USING ivfflat (embedding vector_cosine_ops);

ALTER TABLE news_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "news_read" ON news_cache FOR SELECT USING (true);

-- ─── Harvest Config ───────────────────────────────────────────────────────────
CREATE TABLE harvest_config (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fixed_amount    FLOAT NOT NULL DEFAULT 500,
  pct_return      FLOAT NOT NULL DEFAULT 0.05,
  reserve_pct     FLOAT NOT NULL DEFAULT 20,
  cooldown_days   INT NOT NULL DEFAULT 7,
  enabled         BOOLEAN NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default config row
INSERT INTO harvest_config (fixed_amount, pct_return, reserve_pct, cooldown_days, enabled)
VALUES (500, 0.05, 20, 7, false);

ALTER TABLE harvest_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "harvest_config_read" ON harvest_config FOR SELECT USING (true);

-- ─── Withdrawals ─────────────────────────────────────────────────────────────
CREATE TABLE withdrawals (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trigger_type              TEXT NOT NULL CHECK (trigger_type IN ('fixed', 'percentage')),
  realized_pnl_at_trigger   FLOAT NOT NULL,
  withdrawal_amount         FLOAT NOT NULL,
  account_value_at_trigger  FLOAT NOT NULL,
  reserve_retained          FLOAT NOT NULL,
  ach_reference             TEXT,
  status                    TEXT NOT NULL DEFAULT 'notified' CHECK (status IN ('notified', 'completed', 'cancelled')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_withdrawals_status   ON withdrawals (status);
CREATE INDEX idx_withdrawals_created  ON withdrawals (created_at DESC);

ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "withdrawals_read" ON withdrawals FOR SELECT USING (true);

-- ─── Agent State ─────────────────────────────────────────────────────────────
CREATE TABLE agent_state (
  agent        TEXT PRIMARY KEY CHECK (agent IN ('sentiment', 'technical', 'fundamental', 'meta')),
  status       TEXT NOT NULL DEFAULT 'paused' CHECK (status IN ('running', 'paused', 'error')),
  last_run_at  TIMESTAMPTZ,
  last_error   TEXT
);

-- Seed agent rows
INSERT INTO agent_state (agent, status) VALUES
  ('sentiment',   'paused'),
  ('technical',   'paused'),
  ('fundamental', 'paused'),
  ('meta',        'paused');

ALTER TABLE agent_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_state_read" ON agent_state FOR SELECT USING (true);

-- ─── Agent Prompts ────────────────────────────────────────────────────────────
CREATE TABLE agent_prompts (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent      TEXT NOT NULL CHECK (agent IN ('sentiment', 'technical', 'fundamental', 'meta')),
  version    INT NOT NULL DEFAULT 1,
  prompt     TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prompts_agent ON agent_prompts (agent, active);

-- Seed default prompts
INSERT INTO agent_prompts (agent, version, prompt, active) VALUES
  ('sentiment', 1,
   'You are a financial sentiment analysis expert. Analyze the provided news headlines and return ONLY a valid JSON object. No preamble, no markdown. Schema: { sentiment: "bullish"|"bearish"|"neutral", confidence: 0-1, tickers: string[], rationale: string }',
   true),
  ('technical', 1,
   'You are a technical analysis expert. Analyze the provided OHLCV data and indicators and return ONLY a valid JSON object. No preamble, no markdown. Schema: { pattern: string, signal: "BUY"|"SELL"|"HOLD", entry: number, rationale: string }',
   true),
  ('fundamental', 1,
   'You are a fundamental analysis expert. Analyze the provided financial metrics and return ONLY a valid JSON object. No preamble, no markdown. Schema: { fairValue: number, catalyst: string, horizon: "intraday"|"swing"|"long", rationale: string }',
   true),
  ('meta', 1,
   'You are a senior portfolio manager synthesizing multiple analyst reports. Return ONLY valid JSON — no preamble, no markdown. Schema: { action: "BUY"|"SELL"|"HOLD", ticker: string, size: 0-0.05, horizon: "intraday"|"swing"|"long", confidence: 0-1, rationale: string }. Be conservative with sizing.',
   true);

ALTER TABLE agent_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prompts_read" ON agent_prompts FOR SELECT USING (true);
