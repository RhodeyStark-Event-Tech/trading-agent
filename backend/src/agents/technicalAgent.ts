import { anthropic, AGENT_MODEL, AGENT_MAX_TOKENS } from '../lib/anthropic.js';
import { supabase } from '../lib/supabase.js';
import { parseLLMOutput, TechnicalAgentOutputSchema } from '../lib/schemas.js';
import { logger } from '../lib/logger.js';
import type { TechnicalAgentOutput, OHLCV, Indicators } from '@trading-agent/types';

const loadPrompt = async (): Promise<string> => {
  const { data } = await supabase
    .from('agent_prompts')
    .select('prompt')
    .eq('agent', 'technical')
    .eq('active', true)
    .single();

  return (data?.prompt as string | undefined) ?? `You are a technical analysis expert. Analyze the provided OHLCV data and indicators and return ONLY a valid JSON object.
No preamble, no markdown, no explanation — raw JSON only.
Schema: { pattern: string, signal: "BUY"|"SELL"|"HOLD", entry: number, rationale: string }

Guidelines:
- Identify the dominant pattern (e.g. breakout, double bottom, head and shoulders, channel, consolidation)
- signal should be BUY, SELL, or HOLD based on the pattern and indicator confluence
- entry should be the recommended entry price based on current price action
- rationale should explain which indicators support the signal and why`;
};

export type TechnicalAgentInput = {
  ticker: string;
  candles: OHLCV[];
  indicators: Indicators;
  currentPrice: number;
};

export const runTechnicalAgent = async (
  input: TechnicalAgentInput,
): Promise<TechnicalAgentOutput> => {
  const start = Date.now();
  const systemPrompt = await loadPrompt();

  const response = await anthropic.messages.create({
    model: AGENT_MODEL,
    max_tokens: AGENT_MAX_TOKENS,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Analyze the technical setup for ${input.ticker} at current price $${input.currentPrice.toFixed(2)}.

Recent OHLCV (last 5 candles):
${input.candles.slice(-5).map((c) =>
  `  ${c.timestamp}: O=${c.open.toFixed(2)} H=${c.high.toFixed(2)} L=${c.low.toFixed(2)} C=${c.close.toFixed(2)} V=${c.volume}`
).join('\n')}

Technical Indicators:
  RSI(14): ${input.indicators.rsi.toFixed(2)}
  MACD: ${input.indicators.macd.toFixed(4)} | Signal: ${input.indicators.macdSignal.toFixed(4)}
  Bollinger Bands: Upper=${input.indicators.bbUpper.toFixed(2)} Mid=${input.indicators.bbMiddle.toFixed(2)} Lower=${input.indicators.bbLower.toFixed(2)}
  VWAP: ${input.indicators.vwap.toFixed(2)}
  EMA9: ${input.indicators.ema9.toFixed(2)} | EMA21: ${input.indicators.ema21.toFixed(2)}
  ATR(14): ${input.indicators.atr.toFixed(2)}

Respond ONLY with valid JSON matching the schema.`,
      },
    ],
  });

  const latencyMs = Date.now() - start;
  const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
  const output = parseLLMOutput(TechnicalAgentOutputSchema, raw);

  logger.info({
    agent: 'technical',
    ticker: input.ticker,
    signal: output.signal,
    pattern: output.pattern,
    entry: output.entry,
    latency_ms: latencyMs,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  }, 'Technical agent completed');

  return output;
};
