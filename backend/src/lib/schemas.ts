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

export const EducationCardOutputSchema = z.object({
  companyName: z.string().min(1),
  companyOverview: z.string().min(20),
  tradeRationale: z.string().min(20),
  conceptTitle: z.string().min(3),
  conceptExplanation: z.string().min(50),
  riskNote: z.string().min(20),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  tags: z.array(z.string()).min(1).max(5),
});

export const HarvestConfigSchema = z.object({
  fixedAmount: z.number().positive(),
  pctReturn: z.number().min(0).max(1),
  reservePct: z.number().min(0).max(100),
  cooldownDays: z.number().int().min(1),
  enabled: z.boolean(),
});

// ─── Route Input Validation ──────────────────────────────────────────────────

const VALID_AGENTS = ['sentiment', 'technical', 'fundamental', 'meta'] as const;
const VALID_TRADE_STATUSES = ['pending', 'filled', 'cancelled', 'rejected'] as const;

export const AgentParamSchema = z.enum(VALID_AGENTS);
export const TradeStatusSchema = z.enum(VALID_TRADE_STATUSES);
export const TickerSchema = z.string().min(1).max(5).regex(/^[A-Z]+$/, 'Ticker must be uppercase letters only');
export const LimitSchema = z.coerce.number().int().min(1).default(50).transform((v) => Math.min(v, 200));
export const UUIDSchema = z.string().uuid('Invalid ID format');
export const AchReferenceSchema = z.string().max(100).regex(/^[a-zA-Z0-9\-_]*$/, 'Invalid ACH reference format').optional();

export const RunSentimentInputSchema = z.object({
  headlines: z.array(z.string().min(1).max(500)).min(1).max(50),
  tickers: z.array(TickerSchema).min(1).max(10),
});

export const RunMetaInputSchema = z.object({
  ticker: TickerSchema,
  sentiment: SentimentAgentOutputSchema.optional(),
  technical: TechnicalAgentOutputSchema.optional(),
  fundamental: FundamentalAgentOutputSchema.optional(),
});

// Helper: parse and validate LLM JSON output safely
export const parseLLMOutput = <T>(schema: z.ZodSchema<T>, raw: string): T => {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const parsed: unknown = JSON.parse(cleaned);
  return schema.parse(parsed);
};
