import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { asyncHandler } from '../middleware/errorHandler.js';
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
  const agent = req.params['agent'];
  const { data, error } = await supabase
    .from('agent_state')
    .update({ status: 'paused' })
    .eq('agent', agent)
    .select()
    .single();

  if (error) throw new Error(error.message);
  res.json({ success: true, data });
}));

// POST /api/agents/:agent/resume
agentsRouter.post('/:agent/resume', asyncHandler(async (req, res) => {
  const agent = req.params['agent'];
  const { data, error } = await supabase
    .from('agent_state')
    .update({ status: 'running' })
    .eq('agent', agent)
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
  const { headlines, tickers } = req.body as { headlines: string[]; tickers: string[] };
  if (!headlines?.length || !tickers?.length) {
    res.status(400).json({ success: false, error: 'headlines and tickers required' });
    return;
  }
  const output = await runSentimentAgent(headlines, tickers);
  res.json({ success: true, data: output });
}));

// POST /api/agents/run/meta — manually trigger meta agent
agentsRouter.post('/run/meta', asyncHandler(async (req, res) => {
  const output = await runMetaAgent(req.body as Parameters<typeof runMetaAgent>[0]);
  res.json({ success: true, data: output });
}));
