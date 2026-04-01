import { z } from 'zod';

export const SentimentAgentOutputSchema = z.object({
  sentiment: z.enum(['bullish', 'bearish', 'neutral']),
  confidence: z.number().min(0).max(1),
  tickers: z.array(z.string().min(1).max(5)),
  rationale: z.string().min(10),
});

export const TechnicalAgentOutputSchema = z.object({
  pattern: z.string().min(1),
  signal: z.enum(['BUY', 'SELL', 'HOLD']),
  entry: z.number().positive(),
  rationale: z.string().min(10),
});

export const FundamentalAgentOutputSchema = z.object({
  fairValue: z.number().positive(),
  catalyst: z.string().min(1),
  horizon: z.enum(['intraday', 'swing', 'long']),
  rationale: z.string().min(10),
});

export const MetaAgentOutputSchema = z.object({
  action: z.enum(['BUY', 'SELL', 'HOLD']),
  ticker: z.string().min(1).max(5),
  size: z.number().min(0).max(0.05), // max 5% of portfolio
  horizon: z.enum(['intraday', 'swing', 'long']),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(10),
});

export const HarvestConfigSchema = z.object({
  fixedAmount: z.number().positive(),
  pctReturn: z.number().min(0).max(1),
  reservePct: z.number().min(0).max(100),
  cooldownDays: z.number().int().min(1),
  enabled: z.boolean(),
});

// Helper: parse and validate LLM JSON output safely
export const parseLLMOutput = <T>(schema: z.ZodSchema<T>, raw: string): T => {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const parsed: unknown = JSON.parse(cleaned);
  return schema.parse(parsed);
};
