-- ─── Education Cards ─────────────────────────────────────────────────────────
CREATE TABLE education_cards (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trade_id            UUID NOT NULL UNIQUE REFERENCES trades (id) ON DELETE CASCADE,
  ticker              TEXT NOT NULL,
  action              TEXT NOT NULL CHECK (action IN ('BUY', 'SELL')),
  company_name        TEXT NOT NULL,
  company_overview    TEXT NOT NULL,
  trade_rationale     TEXT NOT NULL,
  concept_title       TEXT NOT NULL,
  concept_explanation TEXT NOT NULL,
  risk_note           TEXT NOT NULL,
  difficulty          TEXT NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  tags                TEXT[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_education_trade   ON education_cards (trade_id);
CREATE INDEX idx_education_ticker  ON education_cards (ticker);
CREATE INDEX idx_education_created ON education_cards (created_at DESC);

ALTER TABLE education_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "education_read" ON education_cards FOR SELECT USING (true);
