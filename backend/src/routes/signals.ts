import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AgentParamSchema, LimitSchema, UUIDSchema } from '../lib/schemas.js';

export const signalsRouter = Router();

// GET /api/signals — fetch recent signals
signalsRouter.get('/', asyncHandler(async (req, res) => {
  const limit = LimitSchema.parse(req.query['limit'] ?? 50);
  const agent = req.query['agent'] as string | undefined;
  const ticker = req.query['ticker'] as string | undefined;

  let query = supabase
    .from('signals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (agent) {
    const parsed = AgentParamSchema.safeParse(agent);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid agent filter' });
      return;
    }
    query = query.eq('agent', parsed.data);
  }
  if (ticker) {
    const clean = ticker.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
    if (clean) query = query.eq('ticker', clean);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  res.json({ success: true, data });
}));

// GET /api/signals/:id — fetch single signal
signalsRouter.get('/:id', asyncHandler(async (req, res) => {
  const parsed = UUIDSchema.safeParse(req.params['id']);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid ID format' });
    return;
  }

  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .eq('id', parsed.data)
    .single();

  if (error) throw new Error(error.message);
  res.json({ success: true, data });
}));
