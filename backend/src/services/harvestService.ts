import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import type { HarvestConfig, HarvestNotificationPayload, HarvestTriggerType } from '@trading-agent/types';

const BASE_URL = process.env['BASE_URL'] ?? 'http://localhost:3001';
const SLACK_WEBHOOK_URL = process.env['SLACK_WEBHOOK_URL'];

// ─── Realized P&L ─────────────────────────────────────────────────────────────

export const getRealizedPnLSinceLastHarvest = async (): Promise<number> => {
  // Get the last completed withdrawal date
  const { data: lastWithdrawal } = await supabase
    .from('withdrawals')
    .select('created_at')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const since = lastWithdrawal?.created_at ?? '1970-01-01T00:00:00Z';

  // Sum realized P&L from closed trades since last withdrawal
  const { data: trades } = await supabase
    .from('trades')
    .select('price, quantity, action')
    .eq('status', 'filled')
    .gte('created_at', since);

  if (!trades) return 0;

  return trades.reduce((acc, t) => {
    const trade = t as { price: number; quantity: number; action: string };
    const value = trade.price * trade.quantity;
    return trade.action === 'SELL' ? acc + value : acc - value;
  }, 0);
};

export const getDaysSinceLastWithdrawal = async (): Promise<number> => {
  const { data } = await supabase
    .from('withdrawals')
    .select('created_at')
    .in('status', ['completed', 'notified'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return Infinity;

  const last = new Date(data.created_at as string);
  const now = new Date();
  return Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
};

// ─── Reserve Calculation ──────────────────────────────────────────────────────

export const calculateWithdrawalAmount = (
  realizedPnL: number,
  portfolioValue: number,
  reservePct: number,
): number => {
  const minReserve = portfolioValue * (reservePct / 100);
  const availableCash = portfolioValue - minReserve;
  return +Math.min(realizedPnL, availableCash).toFixed(2);
};

// ─── Notification ─────────────────────────────────────────────────────────────

const sendSlackNotification = async (payload: HarvestNotificationPayload): Promise<void> => {
  if (!SLACK_WEBHOOK_URL) {
    logger.warn('No SLACK_WEBHOOK_URL set — skipping notification');
    return;
  }

  const body = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '💰 Profit Harvest Triggered' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Trigger:* ${payload.triggerType}` },
          { type: 'mrkdwn', text: `*Realized P&L:* $${payload.realizedPnl.toFixed(2)}` },
          { type: 'mrkdwn', text: `*Withdrawal Amount:* $${payload.withdrawalAmount.toFixed(2)}` },
          { type: 'mrkdwn', text: `*Reserve Retained:* $${payload.reserveRetained.toFixed(2)}` },
          { type: 'mrkdwn', text: `*Portfolio Value:* $${payload.portfolioValueAtTrigger.toFixed(2)}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Action Required:* ${payload.instructions}` },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Confirm Transfer ✅' },
            url: payload.confirmationUrl,
            style: 'primary',
          },
        ],
      },
    ],
  };

  await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
};

// ─── Main Evaluator ───────────────────────────────────────────────────────────

export const evaluateHarvest = async (config: HarvestConfig): Promise<void> => {
  if (!config.enabled) return;

  const [realizedPnL, daysSinceLast] = await Promise.all([
    getRealizedPnLSinceLastHarvest(),
    getDaysSinceLastWithdrawal(),
  ]);

  logger.info({ realizedPnL, daysSinceLast, config }, 'Evaluating harvest');

  // Cooldown check
  if (daysSinceLast < config.cooldownDays) {
    logger.info({ daysSinceLast, required: config.cooldownDays }, 'Harvest skipped — cooldown active');
    return;
  }

  // Only act on positive realized gains
  if (realizedPnL <= 0) return;

  const pctReturn = realizedPnL / 100000; // TODO: replace with live portfolio value
  const fixedTriggered = realizedPnL >= config.fixedAmount;
  const pctTriggered = pctReturn >= config.pctReturn;

  if (!fixedTriggered && !pctTriggered) return;

  const triggerType: HarvestTriggerType = fixedTriggered ? 'fixed' : 'percentage';
  const portfolioValue = 100000; // TODO: replace with live portfolio value from Schwab
  const withdrawalAmount = calculateWithdrawalAmount(realizedPnL, portfolioValue, config.reservePct);
  const reserveRetained = portfolioValue - withdrawalAmount;

  // Insert withdrawal record
  const { data: withdrawal, error } = await supabase
    .from('withdrawals')
    .insert({
      trigger_type: triggerType,
      realized_pnl_at_trigger: realizedPnL,
      withdrawal_amount: withdrawalAmount,
      account_value_at_trigger: portfolioValue,
      reserve_retained: reserveRetained,
      status: 'notified',
    })
    .select()
    .single();

  if (error || !withdrawal) {
    logger.error({ error }, 'Failed to insert withdrawal record');
    return;
  }

  const notificationPayload: HarvestNotificationPayload = {
    event: 'HARVEST_TRIGGERED',
    triggerType,
    realizedPnl: realizedPnL,
    withdrawalAmount,
    reserveRetained,
    portfolioValueAtTrigger: portfolioValue,
    instructions: `Please initiate an ACH transfer of $${withdrawalAmount.toFixed(2)} via your Schwab dashboard.`,
    confirmationUrl: `${BASE_URL}/api/harvest/confirm/${(withdrawal as { id: string }).id}`,
  };

  await sendSlackNotification(notificationPayload);
  logger.info({ withdrawalId: (withdrawal as { id: string }).id, withdrawalAmount, triggerType }, 'Harvest notification sent');
};
