import { anthropic, AGENT_MODEL, AGENT_MAX_TOKENS } from '../lib/anthropic.js';
import { supabase } from '../lib/supabase.js';
import { parseLLMOutput, FundamentalAgentOutputSchema } from '../lib/schemas.js';
import { logger } from '../lib/logger.js';
import type { FundamentalAgentOutput } from '@trading-agent/types';

const loadPrompt = async (): Promise<string> => {
  const { data } = await supabase
    .from('agent_prompts')
    .select('prompt')
    .eq('agent', 'fundamental')
    .eq('active', true)
    .single();

  return (data?.prompt as string | undefined) ?? `You are a fundamental analysis expert. Analyze the provided financial metrics and return ONLY a valid JSON object.
No preamble, no markdown, no explanation — raw JSON only.
Schema: { fairValue: number, catalyst: string, horizon: "intraday"|"swing"|"long", rationale: string }

Guidelines:
- fairValue should be your estimated fair value per share based on the metrics
- catalyst is the key upcoming event or driver (e.g. "Q4 earnings", "product launch", "sector rotation")
- horizon should reflect when you expect the thesis to play out
- rationale should explain the valuation methodology and key metrics driving your view
- Be conservative — if metrics are mixed, say so`;
};

export type FundamentalAgentInput = {
  ticker: string;
  currentPrice: number;
  metrics: {
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
  recentNews?: string[];
};

export const runFundamentalAgent = async (
  input: FundamentalAgentInput,
): Promise<FundamentalAgentOutput> => {
  const start = Date.now();
  const systemPrompt = await loadPrompt();
  const m = input.metrics;

  const response = await anthropic.messages.create({
    model: AGENT_MODEL,
    max_tokens: AGENT_MAX_TOKENS,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Analyze the fundamentals for ${input.ticker} at current price $${input.currentPrice.toFixed(2)}.

Sector: ${m.sector} | Industry: ${m.industry}

Key Metrics:
  P/E Ratio: ${m.peRatio != null ? m.peRatio.toFixed(2) : 'N/A'}
  Forward P/E: ${m.forwardPE != null ? m.forwardPE.toFixed(2) : 'N/A'}
  EPS: ${m.eps != null ? `$${m.eps.toFixed(2)}` : 'N/A'}
  Revenue Growth: ${m.revenueGrowth != null ? `${(m.revenueGrowth * 100).toFixed(1)}%` : 'N/A'}
  Profit Margin: ${m.profitMargin != null ? `${(m.profitMargin * 100).toFixed(1)}%` : 'N/A'}
  Market Cap: ${m.marketCap != null ? `$${(m.marketCap / 1e9).toFixed(1)}B` : 'N/A'}
  Dividend Yield: ${m.dividendYield != null ? `${(m.dividendYield * 100).toFixed(2)}%` : 'N/A'}
  Debt/Equity: ${m.debtToEquity != null ? m.debtToEquity.toFixed(2) : 'N/A'}

${input.recentNews?.length ? `Recent Headlines:\n${input.recentNews.map((h, i) => `  ${i + 1}. ${h}`).join('\n')}` : ''}

Respond ONLY with valid JSON matching the schema.`,
      },
    ],
  });

  const latencyMs = Date.now() - start;
  const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
  const output = parseLLMOutput(FundamentalAgentOutputSchema, raw);

  logger.info({
    agent: 'fundamental',
    ticker: input.ticker,
    fairValue: output.fairValue,
    horizon: output.horizon,
    latency_ms: latencyMs,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  }, 'Fundamental agent completed');

  return output;
};
