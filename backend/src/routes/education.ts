import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const educationRouter = Router();

// GET /api/education — list education cards
educationRouter.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
  const ticker = req.query['ticker'] as string | undefined;

  let query = supabase
    .from('education_cards')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (ticker) query = query.eq('ticker', ticker);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  res.json({ success: true, data });
}));

// GET /api/education/:id — single education card
educationRouter.get('/:id', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('education_cards')
    .select('*')
    .eq('id', req.params['id'])
    .single();

  if (error) throw new Error(error.message);
  res.json({ success: true, data });
}));
