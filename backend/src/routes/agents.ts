import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AgentParamSchema, RunSentimentInputSchema, RunMetaInputSchema } from '../lib/schemas.js';
import { runSentimentAgent } from '../agents/sentimentAgent.js';
import { runMetaAgent } from '../agents/metaAgent.js';

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
