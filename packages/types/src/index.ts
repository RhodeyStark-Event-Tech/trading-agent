// ─── Agent & Signal Types ─────────────────────────────────────────────────────

export type AgentType = 'sentiment' | 'technical' | 'fundamental' | 'meta';
export type TradeAction = 'BUY' | 'SELL' | 'HOLD';
export type TradeHorizon = 'intraday' | 'swing' | 'long';

export type Signal = {
  id: string;
  ticker: string;
  agent: AgentType;
  action: TradeAction;
  confidence: number; // 0.0 – 1.0
  rationale: Record<string, unknown>;
  createdAt: string;
};

export type SentimentAgentOutput = {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  tickers: string[];
  rationale: string;
};

export type TechnicalAgentOutput = {
  pattern: string;
  signal: TradeAction;
  entry: number;
  rationale: string;
};

export type FundamentalAgentOutput = {
  fairValue: number;
  catalyst: string;
  horizon: TradeHorizon;
  rationale: string;
};

export type MetaAgentOutput = {
  action: TradeAction;
  ticker: string;
  size: number; // 0.0 – 0.05 (max 5% of portfolio)
  horizon: TradeHorizon;
  confidence: number;
  rationale: string;
};

// ─── Trade & Position Types ───────────────────────────────────────────────────

export type TradeStatus = 'pending' | 'filled' | 'cancelled' | 'rejected';

export type Trade = {
  id: string;
  signalId: string;
  ticker: string;
  action: TradeAction;
  quantity: number;
  price: number;
  status: TradeStatus;
  createdAt: string;
};

export type Position = {
  id: string;
  ticker: string;
  quantity: number;
  avgCost: number;
  unrealizedPnl: number;
  updatedAt: string;
};

// ─── Harvest Types ────────────────────────────────────────────────────────────

export type HarvestTriggerType = 'fixed' | 'percentage';
export type WithdrawalStatus = 'notified' | 'completed' | 'cancelled';

export type HarvestConfig = {
  id: string;
  fixedAmount: number;
  pctReturn: number;
  reservePct: number;
  cooldownDays: number;
  enabled: boolean;
  updatedAt: string;
};

export type Withdrawal = {
  id: string;
  triggerType: HarvestTriggerType;
  realizedPnlAtTrigger: number;
  withdrawalAmount: number;
  accountValueAtTrigger: number;
  reserveRetained: number;
  achReference: string | null;
  status: WithdrawalStatus;
  createdAt: string;
};

// ─── Market Data Types ────────────────────────────────────────────────────────

export type OHLCV = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Quote = {
  ticker: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  timestamp: string;
};

export type Indicators = {
  rsi: number;
  macd: number;
  macdSignal: number;
  bbUpper: number;
  bbLower: number;
  bbMiddle: number;
  vwap: number;
  ema9: number;
  ema21: number;
  atr: number;
};

// ─── Notification Types ───────────────────────────────────────────────────────

export type HarvestNotificationPayload = {
  event: 'HARVEST_TRIGGERED';
  triggerType: HarvestTriggerType;
  realizedPnl: number;
  withdrawalAmount: number;
  reserveRetained: number;
  portfolioValueAtTrigger: number;
  instructions: string;
  confirmationUrl: string;
};

// ─── API Response Types ───────────────────────────────────────────────────────

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiError = {
  success: false;
  error: string;
  code?: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Agent Control Types ──────────────────────────────────────────────────────

export type AgentStatus = 'running' | 'paused' | 'error';
export type TradingMode = 'paper' | 'live';

export type AgentState = {
  agent: AgentType;
  status: AgentStatus;
  lastRunAt: string | null;
  lastError: string | null;
};
