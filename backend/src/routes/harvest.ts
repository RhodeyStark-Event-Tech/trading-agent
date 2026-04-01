import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { HarvestConfigSchema } from '../lib/schemas.js';
import { evaluateHarvest, getRealizedPnLSinceLastHarvest } from '../services/harvestService.js';

export const harvestRouter = Router();

// GET /api/harvest/config
harvestRouter.get('/config', asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from('harvest_config')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Harvest config not found');
  res.json({ success: true, data: data[0] });
}));

// PUT /api/harvest/config — update harvest settings
harvestRouter.put('/config', asyncHandler(async (req, res) => {
  const parsed = HarvestConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  const { data, error } = await supabase
    .from('harvest_config')
    .upsert({
      fixed_amount: parsed.data.fixedAmount,
      pct_return: parsed.data.pctReturn,
      reserve_pct: parsed.data.reservePct,
      cooldown_days: parsed.data.cooldownDays,
      enabled: parsed.data.enabled,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  res.json({ success: true, data });
}));

// GET /api/harvest/status — current P&L vs threshold
harvestRouter.get('/status', asyncHandler(async (_req, res) => {
  const [{ data: config }, realizedPnL] = await Promise.all([
    supabase.from('harvest_config').select('*').single(),
    getRealizedPnLSinceLastHarvest(),
  ]);

  res.json({
    success: true,
    data: {
      realizedPnL,
      config,
      fixedProgress: config ? realizedPnL / (config as { fixed_amount: number }).fixed_amount : null,
      pctProgress: config ? realizedPnL / (config as { pct_return: number }).pct_return : null,
    },
  });
}));

// GET /api/harvest/withdrawals — withdrawal history
harvestRouter.get('/withdrawals', asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from('withdrawals')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  res.json({ success: true, data });
}));

// POST /api/harvest/confirm/:id — manually confirm withdrawal completed
harvestRouter.post('/confirm/:id', asyncHandler(async (req, res) => {
  const { achReference } = req.body as { achReference?: string };

  const { data, error } = await supabase
    .from('withdrawals')
    .update({
      status: 'completed',
      ach_reference: achReference ?? null,
    })
    .eq('id', req.params['id'])
    .eq('status', 'notified') // can only confirm a notified withdrawal
    .select()
    .single();

  if (error) throw new Error(error.message);
  res.json({ success: true, data });
}));

// POST /api/harvest/evaluate — manually trigger harvest evaluation
harvestRouter.post('/evaluate', asyncHandler(async (_req, res) => {
  const { data: config, error } = await supabase
    .from('harvest_config')
    .select('*')
    .single();

  if (error || !config) throw new Error('Harvest config not found');
  await evaluateHarvest(config as Parameters<typeof evaluateHarvest>[0]);
  res.json({ success: true, data: { message: 'Harvest evaluation complete' } });
}));
