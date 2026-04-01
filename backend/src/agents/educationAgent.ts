import { anthropic, AGENT_MODEL } from '../lib/anthropic.js';
import { parseLLMOutput, EducationCardOutputSchema } from '../lib/schemas.js';
import { logger } from '../lib/logger.js';
import type { z } from 'zod';

const EDUCATION_MAX_TOKENS = 2000;

export type EducationAgentInput = {
  ticker: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  agentName: string;
  confidence: number;
  rationale: Record<string, unknown>;
};

export type EducationCardOutput = z.infer<typeof EducationCardOutputSchema>;

const SYSTEM_PROMPT = `You are a friendly financial education expert helping a beginner investor understand stock trades.

A trading AI just executed a trade. Your job is to explain it in plain English so the user learns something new about investing.

Return ONLY valid JSON — no preamble, no markdown. Use this exact schema:
{
  "companyName": "Full company name",
  "companyOverview": "2-3 sentences about what this company does, its sector, and why it matters to investors",
  "tradeRationale": "Plain-English explanation of why the AI made this trade, based on the agent's reasoning. Avoid jargon — explain as if talking to someone new to investing",
  "conceptTitle": "Name of the trading concept used (e.g. Momentum Trading, Mean Reversion, Earnings Play, Sentiment Analysis)",
  "conceptExplanation": "3-5 sentences explaining this trading concept. What is it? Why do traders use it? What are the risks? Include a simple real-world analogy if possible",
  "riskNote": "2-3 sentences about the risk management applied to this trade — position sizing, stop-losses, or why the trade size was chosen",
  "difficulty": "beginner" | "intermediate" | "advanced",
  "tags": ["up to 5 relevant tags like: momentum, sentiment, earnings, large-cap, tech, value, swing-trade"]
}

Guidelines:
- Write at a level a high school student could understand
- Use analogies and everyday examples where possible
- Be honest about risks — never make trading sound like easy money
- Keep companyOverview factual and general (avoid specific revenue figures that may be outdated)
- The difficulty should reflect how complex the trading concept is, not the company`;

export const runEducationAgent = async (
  input: EducationAgentInput,
): Promise<EducationCardOutput> => {
  const start = Date.now();

  const response = await anthropic.messages.create({
    model: AGENT_MODEL,
    max_tokens: EDUCATION_MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `The trading AI just executed this trade:

Ticker: ${input.ticker}
Action: ${input.action}
Quantity: ${input.quantity} shares
Price: $${input.price.toFixed(2)}
Total Value: $${(input.quantity * input.price).toFixed(2)}

The "${input.agentName}" agent made this decision with ${(input.confidence * 100).toFixed(0)}% confidence.

Agent's reasoning:
${JSON.stringify(input.rationale, null, 2)}

Generate an educational card explaining this trade. Respond ONLY with valid JSON matching the schema.`,
      },
    ],
  });

  const latencyMs = Date.now() - start;
  const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
  const output = parseLLMOutput(EducationCardOutputSchema, raw);

  logger.info({
    agent: 'education',
    ticker: input.ticker,
    action: input.action,
    conceptTitle: output.conceptTitle,
    difficulty: output.difficulty,
    latency_ms: latencyMs,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  }, 'Education agent completed');

  return output;
};
