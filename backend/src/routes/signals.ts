import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const signalsRouter = Router();

// GET /api/signals — fetch recent signals
signalsRouter.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
  const agent = req.query['agent'] as string | undefined;
  const ticker = req.query['ticker'] as string | undefined;

  let query = supabase
    .from('signals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (agent) query = query.eq('agent', agent);
  if (ticker) query = query.eq('ticker', ticker);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  res.json({ success: true, data });
}));

// GET /api/signals/:id — fetch single signal
signalsRouter.get('/:id', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .eq('id', req.params['id'])
    .single();

  if (error) throw new Error(error.message);
  res.json({ success: true, data });
}));
