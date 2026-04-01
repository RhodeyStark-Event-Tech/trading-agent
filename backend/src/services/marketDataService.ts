import { logger } from '../lib/logger.js';
import type { OHLCV, Quote, Indicators } from '@trading-agent/types';

const PYTHON_MS_URL = process.env['PYTHON_MS_URL'] ?? 'http://localhost:8001';
const PYTHON_MS_API_KEY = process.env['PYTHON_MS_API_KEY'] ?? '';

// ─── Quote ───────────────────────────────────────────────────────────────────

export const getQuote = async (ticker: string): Promise<Quote> => {
  try {
    const res = await fetch(`${PYTHON_MS_URL}/market/quote/${ticker}`, {
      headers: { 'X-API-Key': PYTHON_MS_API_KEY },
    });
    if (res.ok) return (await res.json()) as Quote;
  } catch {
    // Fall through to mock
  }

  logger.debug({ ticker }, 'Using mock quote (Python MS unavailable)');
  return getMockQuote(ticker);
};

// ─── OHLCV Candles ───────────────────────────────────────────────────────────

export const getOHLCV = async (ticker: string): Promise<OHLCV[]> => {
  try {
    const res = await fetch(`${PYTHON_MS_URL}/market/ohlcv/${ticker}`, {
      headers: { 'X-API-Key': PYTHON_MS_API_KEY },
    });
    if (res.ok) return (await res.json()) as OHLCV[];
  } catch {
    // Fall through to mock
  }

  logger.debug({ ticker }, 'Using mock OHLCV (Python MS unavailable)');
  return getMockOHLCV(ticker);
};

// ─── Indicators (via Python MS) ──────────────────────────────────────────────

export const getIndicators = async (candles: OHLCV[]): Promise<Indicators> => {
  try {
    const payload = {
      open: candles.map((c) => c.open),
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      close: candles.map((c) => c.close),
      volume: candles.map((c) => c.volume),
    };

    const res = await fetch(`${PYTHON_MS_URL}/indicators/compute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': PYTHON_MS_API_KEY },
      body: JSON.stringify(payload),
    });
    if (res.ok) return (await res.json()) as Indicators;
  } catch {
    // Fall through to mock
  }

  logger.debug('Using mock indicators (Python MS unavailable)');
  return getMockIndicators(candles);
};

// ─── Fundamental Metrics ─────────────────────────────────────────────────────

export type FundamentalMetrics = {
  peRatio: number | null;
  forwardPE: number | null;
  eps: number | null;
  revenueGrowth: number | null;
  profitMargin: number | null;
  marketCap: number | null;
  dividendYield: number | null;
  debtToEquity: number | null;
  sector: string;
  industry: string;
};

export const getFundamentals = async (ticker: string): Promise<FundamentalMetrics> => {
  // TODO: Replace with real data source (Schwab, Alpha Vantage, or Financial Modeling Prep)
  logger.debug({ ticker }, 'Using mock fundamentals');
  return getMockFundamentals(ticker);
};

// ─── Mock Data (used when Python MS or Schwab unavailable) ───────────────────

const MOCK_PRICES: Record<string, number> = {
  AAPL: 185, MSFT: 420, GOOGL: 175, AMZN: 185, NVDA: 880,
  META: 500, TSLA: 175, JPM: 195, V: 280, JNJ: 155,
};

function getMockQuote(ticker: string): Quote {
  const base = MOCK_PRICES[ticker] ?? 100;
  const jitter = base * (0.98 + Math.random() * 0.04);
  return {
    ticker,
    price: +jitter.toFixed(2),
    bid: +(jitter - 0.05).toFixed(2),
    ask: +(jitter + 0.05).toFixed(2),
    volume: Math.floor(1_000_000 + Math.random() * 10_000_000),
    timestamp: new Date().toISOString(),
  };
}

function getMockOHLCV(ticker: string): OHLCV[] {
  const base = MOCK_PRICES[ticker] ?? 100;
  const candles: OHLCV[] = [];
  let price = base;

  for (let i = 50; i >= 0; i--) {
    const change = price * (0.97 + Math.random() * 0.06);
    const open = +price.toFixed(2);
    const close = +change.toFixed(2);
    const high = +Math.max(open, close, open * (1 + Math.random() * 0.02)).toFixed(2);
    const low = +Math.min(open, close, open * (1 - Math.random() * 0.02)).toFixed(2);
    const timestamp = new Date(Date.now() - i * 15 * 60 * 1000).toISOString();
    candles.push({ timestamp, open, high, low, close, volume: Math.floor(50000 + Math.random() * 500000) });
    price = change;
  }

  return candles;
}

function getMockIndicators(candles: OHLCV[]): Indicators {
  const closes = candles.map((c) => c.close);
  const last = closes[closes.length - 1] ?? 100;

  return {
    rsi: 30 + Math.random() * 40, // 30-70 range
    macd: (Math.random() - 0.5) * 2,
    macdSignal: (Math.random() - 0.5) * 1.5,
    bbUpper: +(last * 1.03).toFixed(2),
    bbMiddle: +last.toFixed(2),
    bbLower: +(last * 0.97).toFixed(2),
    vwap: +(last * (0.99 + Math.random() * 0.02)).toFixed(2),
    ema9: +(last * (0.995 + Math.random() * 0.01)).toFixed(2),
    ema21: +(last * (0.99 + Math.random() * 0.02)).toFixed(2),
    atr: +(last * 0.015).toFixed(2),
  };
}

function getMockFundamentals(ticker: string): FundamentalMetrics {
  const sectors: Record<string, [string, string]> = {
    AAPL: ['Technology', 'Consumer Electronics'],
    MSFT: ['Technology', 'Software'],
    GOOGL: ['Technology', 'Internet Services'],
    AMZN: ['Consumer Cyclical', 'E-Commerce'],
    NVDA: ['Technology', 'Semiconductors'],
    META: ['Technology', 'Social Media'],
    TSLA: ['Consumer Cyclical', 'Auto Manufacturers'],
    JPM: ['Financial Services', 'Banks'],
    V: ['Financial Services', 'Payments'],
    JNJ: ['Healthcare', 'Pharmaceuticals'],
  };

  const [sector, industry] = sectors[ticker] ?? ['Unknown', 'Unknown'];

  return {
    peRatio: 15 + Math.random() * 30,
    forwardPE: 12 + Math.random() * 25,
    eps: 3 + Math.random() * 10,
    revenueGrowth: -0.05 + Math.random() * 0.3,
    profitMargin: 0.05 + Math.random() * 0.35,
    marketCap: (50 + Math.random() * 2500) * 1e9,
    dividendYield: Math.random() > 0.5 ? Math.random() * 0.03 : null,
    debtToEquity: Math.random() * 2,
    sector,
    industry,
  };
}
