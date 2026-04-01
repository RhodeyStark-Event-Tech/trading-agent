import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const positionsRouter = Router();

// GET /api/positions — all open positions
positionsRouter.get('/', asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .gt('quantity', 0)
    .order('unrealized_pnl', { ascending: false });

  if (error) throw new Error(error.message);
  res.json({ success: true, data });
}));

// GET /api/positions/summary — portfolio summary
positionsRouter.get('/summary', asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from('positions')
    .select('unrealized_pnl, quantity, avg_cost')
    .gt('quantity', 0);

  if (error) throw new Error(error.message);

  const totalUnrealizedPnl = data.reduce((acc, p) => acc + (p as { unrealized_pnl: number }).unrealized_pnl, 0);
  const totalPositions = data.length;
  const totalCostBasis = data.reduce((acc, p) => {
    const pos = p as { quantity: number; avg_cost: number };
    return acc + pos.quantity * pos.avg_cost;
  }, 0);

  res.json({
    success: true,
    data: { totalUnrealizedPnl, totalPositions, totalCostBasis },
  });
}));
