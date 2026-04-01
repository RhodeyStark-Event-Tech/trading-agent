import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const tradesRouter = Router();

// GET /api/trades — fetch trade history
tradesRouter.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
  const ticker = req.query['ticker'] as string | undefined;
  const status = req.query['status'] as string | undefined;

  let query = supabase
    .from('trades')
    .select('*, signals(agent, confidence, rationale)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (ticker) query = query.eq('ticker', ticker);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  res.json({ success: true, data });
}));

// GET /api/trades/:id
tradesRouter.get('/:id', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('trades')
    .select('*, signals(agent, confidence, rationale)')
    .eq('id', req.params['id'])
    .single();

  if (error) throw new Error(error.message);
  res.json({ success: true, data });
}));

// PATCH /api/trades/:id/status — update trade status (e.g. filled confirmation)
tradesRouter.patch('/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body as { status: string };
  const allowed = ['pending', 'filled', 'cancelled', 'rejected'];
  if (!allowed.includes(status)) {
    res.status(400).json({ success: false, error: 'Invalid status' });
    return;
  }

  const { data, error } = await supabase
    .from('trades')
    .update({ status })
    .eq('id', req.params['id'])
    .select()
    .single();

  if (error) throw new Error(error.message);
  res.json({ success: true, data });
}));
