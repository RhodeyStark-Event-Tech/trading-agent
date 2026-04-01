import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { LimitSchema, TradeStatusSchema } from '../lib/schemas.js';
import { educationQueue } from '../queues/index.js';

export const tradesRouter = Router();

// GET /api/trades — fetch trade history
tradesRouter.get('/', asyncHandler(async (req, res) => {
  const limit = LimitSchema.parse(req.query['limit'] ?? 50);
  const ticker = req.query['ticker'] as string | undefined;
  const status = req.query['status'] as string | undefined;

  let query = supabase
    .from('trades')
    .select('*, signals(agent, confidence, rationale)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (ticker) {
    const clean = ticker.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
    if (clean) query = query.eq('ticker', clean);
  }
  if (status) {
    const parsed = TradeStatusSchema.safeParse(status);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid status filter' });
      return;
    }
    query = query.eq('status', parsed.data);
  }

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
  const parsed = TradeStatusSchema.safeParse(req.body?.status);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid status. Must be: pending, filled, cancelled, or rejected' });
    return;
  }
  const status = parsed.data;

  const { data, error } = await supabase
    .from('trades')
    .update({ status })
    .eq('id', req.params['id'])
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Trigger education card generation when a trade is filled
  if (status === 'filled' && data) {
    const trade = data as { id: string; ticker: string; action: string; quantity: number; price: number; signal_id: string | null };
    let agentName = 'meta';
    let confidence = 0;
    let rationale: Record<string, unknown> = {};

    if (trade.signal_id) {
      const { data: signal } = await supabase
        .from('signals')
        .select('agent, confidence, rationale')
        .eq('id', trade.signal_id)
        .single();

      if (signal) {
        agentName = (signal as { agent: string }).agent;
        confidence = (signal as { confidence: number }).confidence;
        rationale = (signal as { rationale: Record<string, unknown> }).rationale;
      }
    }

    await educationQueue?.add('generate-education', {
      tradeId: trade.id,
      ticker: trade.ticker,
      action: trade.action,
      quantity: trade.quantity,
      price: trade.price,
      agentName,
      confidence,
      rationale,
    }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
  }

  res.json({ success: true, data });
}));
