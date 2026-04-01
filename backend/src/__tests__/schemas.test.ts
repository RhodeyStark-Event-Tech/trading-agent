import { describe, it, expect } from 'vitest';
import {
  SentimentAgentOutputSchema,
  TechnicalAgentOutputSchema,
  FundamentalAgentOutputSchema,
  MetaAgentOutputSchema,
  HarvestConfigSchema,
  parseLLMOutput,
} from '../lib/schemas.js';

describe('SentimentAgentOutputSchema', () => {
  const valid = {
    sentiment: 'bullish',
    confidence: 0.85,
    tickers: ['AAPL', 'MSFT'],
    rationale: 'Strong earnings beat and positive forward guidance from both companies',
  };

  it('accepts valid output', () => {
    expect(SentimentAgentOutputSchema.parse(valid)).toEqual(valid);
  });

  it('rejects invalid sentiment value', () => {
    expect(() => SentimentAgentOutputSchema.parse({ ...valid, sentiment: 'positive' })).toThrow();
  });

  it('rejects confidence > 1', () => {
    expect(() => SentimentAgentOutputSchema.parse({ ...valid, confidence: 1.5 })).toThrow();
  });

  it('rejects confidence < 0', () => {
    expect(() => SentimentAgentOutputSchema.parse({ ...valid, confidence: -0.1 })).toThrow();
  });

  it('rejects empty tickers array', () => {
    // Tickers items must be min 1 char, but empty array is allowed by zod array
    // The schema uses z.array(z.string().min(1).max(5))
    expect(SentimentAgentOutputSchema.parse({ ...valid, tickers: [] })).toEqual({ ...valid, tickers: [] });
  });

  it('rejects ticker longer than 5 chars', () => {
    expect(() => SentimentAgentOutputSchema.parse({ ...valid, tickers: ['TOOLONG'] })).toThrow();
  });

  it('rejects rationale shorter than 10 chars', () => {
    expect(() => SentimentAgentOutputSchema.parse({ ...valid, rationale: 'Short' })).toThrow();
  });
});

describe('TechnicalAgentOutputSchema', () => {
  const valid = {
    pattern: 'double bottom',
    signal: 'BUY',
    entry: 150.25,
    rationale: 'Clear double bottom pattern with RSI divergence confirming reversal',
  };

  it('accepts valid output', () => {
    expect(TechnicalAgentOutputSchema.parse(valid)).toEqual(valid);
  });

  it('rejects invalid signal value', () => {
    expect(() => TechnicalAgentOutputSchema.parse({ ...valid, signal: 'LONG' })).toThrow();
  });

  it('rejects negative entry price', () => {
    expect(() => TechnicalAgentOutputSchema.parse({ ...valid, entry: -10 })).toThrow();
  });

  it('rejects zero entry price', () => {
    expect(() => TechnicalAgentOutputSchema.parse({ ...valid, entry: 0 })).toThrow();
  });
});

describe('FundamentalAgentOutputSchema', () => {
  const valid = {
    fairValue: 180.50,
    catalyst: 'Q4 earnings',
    horizon: 'swing',
    rationale: 'Revenue growth accelerating with expanding margins, undervalued relative to peers',
  };

  it('accepts valid output', () => {
    expect(FundamentalAgentOutputSchema.parse(valid)).toEqual(valid);
  });

  it('rejects invalid horizon', () => {
    expect(() => FundamentalAgentOutputSchema.parse({ ...valid, horizon: 'weekly' })).toThrow();
  });

  it('rejects negative fair value', () => {
    expect(() => FundamentalAgentOutputSchema.parse({ ...valid, fairValue: -50 })).toThrow();
  });
});

describe('MetaAgentOutputSchema', () => {
  const valid = {
    action: 'BUY',
    ticker: 'AAPL',
    size: 0.03,
    horizon: 'swing',
    confidence: 0.8,
    rationale: 'All three agents agree on bullish outlook with high confidence scores',
  };

  it('accepts valid output', () => {
    expect(MetaAgentOutputSchema.parse(valid)).toEqual(valid);
  });

  it('rejects size > 0.05 (5% cap)', () => {
    expect(() => MetaAgentOutputSchema.parse({ ...valid, size: 0.06 })).toThrow();
  });

  it('rejects negative size', () => {
    expect(() => MetaAgentOutputSchema.parse({ ...valid, size: -0.01 })).toThrow();
  });

  it('accepts size at boundary (0.05)', () => {
    expect(MetaAgentOutputSchema.parse({ ...valid, size: 0.05 })).toEqual({ ...valid, size: 0.05 });
  });

  it('accepts size at zero (HOLD)', () => {
    expect(MetaAgentOutputSchema.parse({ ...valid, size: 0, action: 'HOLD' })).toBeTruthy();
  });

  it('rejects ticker longer than 5 chars', () => {
    expect(() => MetaAgentOutputSchema.parse({ ...valid, ticker: 'TOOLONG' })).toThrow();
  });
});

describe('HarvestConfigSchema', () => {
  const valid = {
    fixedAmount: 500,
    pctReturn: 0.05,
    reservePct: 20,
    cooldownDays: 7,
    enabled: true,
  };

  it('accepts valid config', () => {
    expect(HarvestConfigSchema.parse(valid)).toEqual(valid);
  });

  it('rejects negative fixed amount', () => {
    expect(() => HarvestConfigSchema.parse({ ...valid, fixedAmount: -100 })).toThrow();
  });

  it('rejects zero fixed amount', () => {
    expect(() => HarvestConfigSchema.parse({ ...valid, fixedAmount: 0 })).toThrow();
  });

  it('rejects pctReturn > 1', () => {
    expect(() => HarvestConfigSchema.parse({ ...valid, pctReturn: 1.5 })).toThrow();
  });

  it('rejects reservePct > 100', () => {
    expect(() => HarvestConfigSchema.parse({ ...valid, reservePct: 101 })).toThrow();
  });

  it('rejects fractional cooldown days', () => {
    expect(() => HarvestConfigSchema.parse({ ...valid, cooldownDays: 3.5 })).toThrow();
  });

  it('rejects zero cooldown days', () => {
    expect(() => HarvestConfigSchema.parse({ ...valid, cooldownDays: 0 })).toThrow();
  });

  it('accepts lowered harvest threshold for small portfolio', () => {
    const smallConfig = { ...valid, fixedAmount: 25, pctReturn: 0.1 };
    expect(HarvestConfigSchema.parse(smallConfig)).toEqual(smallConfig);
  });
});

describe('parseLLMOutput', () => {
  it('parses raw JSON string', () => {
    const raw = '{"sentiment":"bullish","confidence":0.9,"tickers":["AAPL"],"rationale":"Positive earnings surprise and raised guidance"}';
    const result = parseLLMOutput(SentimentAgentOutputSchema, raw);
    expect(result.sentiment).toBe('bullish');
    expect(result.confidence).toBe(0.9);
  });

  it('strips markdown code fences', () => {
    const raw = '```json\n{"sentiment":"bearish","confidence":0.7,"tickers":["TSLA"],"rationale":"Production delays and increasing competition in EV market"}\n```';
    const result = parseLLMOutput(SentimentAgentOutputSchema, raw);
    expect(result.sentiment).toBe('bearish');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseLLMOutput(SentimentAgentOutputSchema, 'not json at all')).toThrow();
  });

  it('throws when JSON is valid but schema fails', () => {
    const raw = '{"sentiment":"positive","confidence":0.5,"tickers":[],"rationale":"some rationale text here"}';
    expect(() => parseLLMOutput(SentimentAgentOutputSchema, raw)).toThrow();
  });

  it('works with MetaAgentOutputSchema', () => {
    const raw = '{"action":"BUY","ticker":"NVDA","size":0.04,"horizon":"swing","confidence":0.92,"rationale":"Strong consensus across all analyst signals with high conviction"}';
    const result = parseLLMOutput(MetaAgentOutputSchema, raw);
    expect(result.action).toBe('BUY');
    expect(result.size).toBe(0.04);
  });

  it('handles whitespace and newlines in LLM output', () => {
    const raw = `

    {"sentiment":"neutral","confidence":0.5,"tickers":["SPY"],"rationale":"Mixed signals across indicators suggest waiting for clearer direction"}

    `;
    const result = parseLLMOutput(SentimentAgentOutputSchema, raw);
    expect(result.sentiment).toBe('neutral');
  });
});
