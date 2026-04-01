import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AgentParamSchema, RunSentimentInputSchema, RunMetaInputSchema, TickerSchema } from '../lib/schemas.js';
import { runSentimentAgent } from '../agents/sentimentAgent.js';
import { runMetaAgent } from '../agents/metaAgent.js';
import { runTechnicalAgent } from '../agents/technicalAgent.js';
import { runFundamentalAgent } from '../agents/fundamentalAgent.js';
import { getQuote, getOHLCV, getIndicators, getFundamentals } from '../services/marketDataService.js';
import { pipelineQueue } from '../queues/index.js';

export const agentsRouter = Router();

// GET /api/agents/status — get all agent statuses
agentsRouter.get('/status', asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from('agent_state')
    .select('*');

  if (error) throw new Error(error.message);
  res.json({ success: true, data });
}));

// POST /api/agents/:agent/pause
agentsRouter.post('/:agent/pause', asyncHandler(async (req, res) => {
  const parsed = AgentParamSchema.safeParse(req.params['agent']);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid agent. Must be: sentiment, technical, fundamental, or meta' });
    return;
  }

  const { data, error } = await supabase
    .from('agent_state')
    .update({ status: 'paused' })
    .eq('agent', parsed.data)
    .select()
    .single();

  if (error) throw new Error(error.message);
  res.json({ success: true, data });
}));

// POST /api/agents/:agent/resume
agentsRouter.post('/:agent/resume', asyncHandler(async (req, res) => {
  const parsed = AgentParamSchema.safeParse(req.params['agent']);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid agent. Must be: sentiment, technical, fundamental, or meta' });
    return;
  }

  const { data, error } = await supabase
    .from('agent_state')
    .update({ status: 'running' })
    .eq('agent', parsed.data)
    .select()
    .single();

  if (error) throw new Error(error.message);
  res.json({ success: true, data });
}));

// GET /api/agents/prompts — get all active prompts
agentsRouter.get('/prompts', asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from('agent_prompts')
    .select('*')
    .eq('active', true)
    .order('agent');

  if (error) throw new Error(error.message);
  res.json({ success: true, data });
}));

// POST /api/agents/run/sentiment — manually trigger sentiment agent
agentsRouter.post('/run/sentiment', asyncHandler(async (req, res) => {
  const parsed = RunSentimentInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }
  const output = await runSentimentAgent(parsed.data.headlines, parsed.data.tickers);
  res.json({ success: true, data: output });
}));

// POST /api/agents/run/technical — manually trigger technical agent
agentsRouter.post('/run/technical', asyncHandler(async (req, res) => {
  const parsed = TickerSchema.safeParse(req.body?.ticker);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Valid ticker required (e.g. AAPL)' });
    return;
  }
  const ticker = parsed.data;
  const [quote, candles] = await Promise.all([getQuote(ticker), getOHLCV(ticker)]);
  const indicators = await getIndicators(candles);
  const output = await runTechnicalAgent({ ticker, candles, indicators, currentPrice: quote.price });
  res.json({ success: true, data: output });
}));

// POST /api/agents/run/fundamental — manually trigger fundamental agent
agentsRouter.post('/run/fundamental', asyncHandler(async (req, res) => {
  const parsed = TickerSchema.safeParse(req.body?.ticker);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Valid ticker required (e.g. AAPL)' });
    return;
  }
  const ticker = parsed.data;
  const [quote, fundamentals] = await Promise.all([getQuote(ticker), getFundamentals(ticker)]);
  const output = await runFundamentalAgent({ ticker, currentPrice: quote.price, metrics: fundamentals });
  res.json({ success: true, data: output });
}));

// POST /api/agents/run/meta — manually trigger meta agent
agentsRouter.post('/run/meta', asyncHandler(async (req, res) => {
  const parsed = RunMetaInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }
  const output = await runMetaAgent(parsed.data);
  res.json({ success: true, data: output });
}));

// POST /api/agents/run/pipeline — run full analysis pipeline for a ticker
agentsRouter.post('/run/pipeline', asyncHandler(async (req, res) => {
  const parsed = TickerSchema.safeParse(req.body?.ticker);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Valid ticker required (e.g. AAPL)' });
    return;
  }

  if (pipelineQueue) {
    await pipelineQueue.add(`pipeline-${parsed.data}`, { ticker: parsed.data }, { attempts: 3 });
    res.json({ success: true, data: { message: `Pipeline queued for ${parsed.data}` } });
  } else {
    res.status(503).json({ success: false, error: 'Queue unavailable — Redis not connected' });
  }
}));
