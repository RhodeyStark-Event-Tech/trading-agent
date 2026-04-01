import { anthropic, AGENT_MODEL, AGENT_MAX_TOKENS } from '../lib/anthropic.js';
import { supabase } from '../lib/supabase.js';
import { parseLLMOutput, MetaAgentOutputSchema } from '../lib/schemas.js';
import { logger } from '../lib/logger.js';
import type {
  MetaAgentOutput,
  SentimentAgentOutput,
  TechnicalAgentOutput,
  FundamentalAgentOutput,
} from '@trading-agent/types';

type MetaAgentInput = {
  ticker: string;
  sentiment?: SentimentAgentOutput;
  technical?: TechnicalAgentOutput;
  fundamental?: FundamentalAgentOutput;
};

const loadPrompt = async (): Promise<string> => {
  const { data } = await supabase
    .from('agent_prompts')
    .select('prompt')
    .eq('agent', 'meta')
    .eq('active', true)
    .single();

  return (data?.prompt as string | undefined) ?? `You are a senior portfolio manager synthesizing multiple analyst reports.
Given inputs from sentiment, technical, and fundamental analysts, produce a final trade decision.
Return ONLY valid JSON — no preamble, no markdown.
Schema: { action: "BUY"|"SELL"|"HOLD", ticker: string, size: 0-0.05, horizon: "intraday"|"swing"|"long", confidence: 0-1, rationale: string }
IMPORTANT: size represents the fraction of portfolio (max 0.05 = 5%). Be conservative.`;
};

export const runMetaAgent = async (input: MetaAgentInput): Promise<MetaAgentOutput> => {
  const start = Date.now();
  const systemPrompt = await loadPrompt();

  const response = await anthropic.messages.create({
    model: AGENT_MODEL,
    max_tokens: AGENT_MAX_TOKENS,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Synthesize the following analyst inputs for ${input.ticker} and produce a trade decision.

Sentiment Analysis: ${input.sentiment ? JSON.stringify(input.sentiment) : 'Not available'}
Technical Analysis: ${input.technical ? JSON.stringify(input.technical) : 'Not available'}
Fundamental Analysis: ${input.fundamental ? JSON.stringify(input.fundamental) : 'Not available'}

Respond ONLY with valid JSON matching the schema.`,
      },
    ],
  });

  const latencyMs = Date.now() - start;
  const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
  const output = parseLLMOutput(MetaAgentOutputSchema, raw);

  logger.info({
    agent: 'meta',
    ticker: input.ticker,
    action: output.action,
    confidence: output.confidence,
    size: output.size,
    latency_ms: latencyMs,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  }, 'Meta agent completed');

  return output;
};
