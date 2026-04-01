import { anthropic, AGENT_MODEL, AGENT_MAX_TOKENS } from '../lib/anthropic.js';
import { supabase } from '../lib/supabase.js';
import { parseLLMOutput, SentimentAgentOutputSchema } from '../lib/schemas.js';
import { logger } from '../lib/logger.js';
import type { SentimentAgentOutput } from '@trading-agent/types';

const loadPrompt = async (): Promise<string> => {
  const { data, error } = await supabase
    .from('agent_prompts')
    .select('prompt')
    .eq('agent', 'sentiment')
    .eq('active', true)
    .single();

  if (error || !data) {
    // Fallback default prompt if not yet in DB
    return `You are a financial sentiment analysis expert. Analyze the provided news headlines and return ONLY a valid JSON object.
No preamble, no markdown, no explanation — raw JSON only.
Schema: { sentiment: "bullish"|"bearish"|"neutral", confidence: 0-1, tickers: string[], rationale: string }`;
  }

  return data.prompt as string;
};

export const runSentimentAgent = async (
  headlines: string[],
  tickers: string[],
): Promise<SentimentAgentOutput> => {
  const start = Date.now();
  const systemPrompt = await loadPrompt();

  const response = await anthropic.messages.create({
    model: AGENT_MODEL,
    max_tokens: AGENT_MAX_TOKENS,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Analyze sentiment for these tickers: ${tickers.join(', ')}
        
Headlines:
${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}

Respond ONLY with valid JSON matching the schema.`,
      },
    ],
  });

  const latencyMs = Date.now() - start;
  const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
  const output = parseLLMOutput(SentimentAgentOutputSchema, raw);

  logger.info({
    agent: 'sentiment',
    tickers,
    action: output.sentiment,
    confidence: output.confidence,
    latency_ms: latencyMs,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  }, 'Sentiment agent completed');

  return output;
};
