import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { LimitSchema, UUIDSchema } from '../lib/schemas.js';

export const educationRouter = Router();

// GET /api/education — list education cards
educationRouter.get('/', asyncHandler(async (req, res) => {
  const limit = LimitSchema.parse(req.query['limit'] ?? 50);
  const ticker = req.query['ticker'] as string | undefined;

  let query = supabase
    .from('education_cards')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (ticker) {
    const clean = ticker.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
    if (clean) query = query.eq('ticker', clean);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  res.json({ success: true, data });
}));

// GET /api/education/:id — single education card
educationRouter.get('/:id', asyncHandler(async (req, res) => {
  const parsed = UUIDSchema.safeParse(req.params['id']);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid ID format' });
    return;
  }

  const { data, error } = await supabase
    .from('education_cards')
    .select('*')
    .eq('id', parsed.data)
    .single();

  if (error) throw new Error(error.message);
  res.json({ success: true, data });
}));
