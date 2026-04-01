import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { calculatePositionSize, checkCircuitBreaker, checkMaxPositions } from './riskEngine.js';
import { educationQueue } from '../queues/index.js';
import type { MetaAgentOutput } from '@trading-agent/types';

const PYTHON_MS_URL = process.env['PYTHON_MS_URL'] ?? 'http://localhost:8001';
const PYTHON_MS_API_KEY = process.env['PYTHON_MS_API_KEY'] ?? '';
const PORTFOLIO_VALUE = 200; // TODO: Replace with live portfolio value from Schwab

export type ExecutionResult = {
  executed: boolean;
  reason?: string;
  tradeId?: string;
  orderId?: string;
};

export const executeSignal = async (
  signal: MetaAgentOutput & { signalId: string },
  currentPrice: number,
): Promise<ExecutionResult> => {
  // Skip HOLD signals
  if (signal.action === 'HOLD') {
    logger.info({ ticker: signal.ticker }, 'HOLD signal — no trade');
    return { executed: false, reason: 'HOLD signal' };
  }

  // Risk check: circuit breaker
  const circuitTripped = await checkCircuitBreaker();
  if (circuitTripped) {
    logger.warn({ ticker: signal.ticker }, 'Circuit breaker active — trade blocked');
    return { executed: false, reason: 'Circuit breaker active' };
  }

  // Risk check: max positions
  const atMax = await checkMaxPositions();
  if (atMax) {
    logger.warn({ ticker: signal.ticker }, 'Max positions reached — trade blocked');
    return { executed: false, reason: 'Max open positions (10) reached' };
  }

  // Calculate position size
  const sizing = calculatePositionSize(PORTFOLIO_VALUE, currentPrice);
  if (sizing.quantity === 0) {
    logger.info({ ticker: signal.ticker, portfolioValue: PORTFOLIO_VALUE, price: currentPrice },
      'Position size too small — skipping');
    return { executed: false, reason: 'Position size too small for portfolio' };
  }

  // Insert trade record as pending
  const { data: trade, error: tradeErr } = await supabase
    .from('trades')
    .insert({
      signal_id: signal.signalId,
      ticker: signal.ticker,
      action: signal.action,
      quantity: sizing.quantity,
      price: currentPrice,
      status: 'pending',
    })
    .select()
    .single();

  if (tradeErr || !trade) {
    logger.error({ err: tradeErr }, 'Failed to insert trade');
    return { executed: false, reason: 'Database error' };
  }

  const tradeId = (trade as { id: string }).id;

  // Place order via Python microservice
  let orderId: string | undefined;
  try {
    const orderRes = await fetch(`${PYTHON_MS_URL}/orders/bracket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': PYTHON_MS_API_KEY },
      body: JSON.stringify({
        ticker: signal.ticker,
        action: signal.action,
        quantity: sizing.quantity,
        entry_price: currentPrice,
        stop_loss: sizing.stopLoss,
        take_profit: sizing.takeProfit,
        account_hash: '', // TODO: from Schwab account
      }),
    });

    if (orderRes.ok) {
      const orderData = (await orderRes.json()) as { order_id: string; status: string; mode: string };
      orderId = orderData.order_id;

      logger.info({
        tradeId,
        orderId,
        mode: orderData.mode,
        ticker: signal.ticker,
        action: signal.action,
        quantity: sizing.quantity,
        price: currentPrice,
      }, 'Order placed');
    } else {
      throw new Error(`Order API returned ${orderRes.status}`);
    }
  } catch (err) {
    // Paper mode fallback: simulate the fill
    orderId = `PAPER-${signal.ticker}-${sizing.quantity}`;
    logger.info({ tradeId, orderId, ticker: signal.ticker }, 'Paper mode — simulating fill');
  }

  // Mark trade as filled
  await supabase
    .from('trades')
    .update({ status: 'filled' })
    .eq('id', tradeId);

  // Update position
  await updatePosition(signal.ticker, signal.action, sizing.quantity, currentPrice);

  // Queue education card
  await educationQueue?.add('generate-education', {
    tradeId,
    ticker: signal.ticker,
    action: signal.action,
    quantity: sizing.quantity,
    price: currentPrice,
    agentName: 'meta',
    confidence: signal.confidence,
    rationale: signal,
  }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });

  logger.info({
    tradeId,
    orderId,
    ticker: signal.ticker,
    action: signal.action,
    quantity: sizing.quantity,
    price: currentPrice,
    stopLoss: sizing.stopLoss,
    takeProfit: sizing.takeProfit,
  }, 'Trade executed');

  return { executed: true, tradeId, orderId };
};

// Update or create position in the positions table
async function updatePosition(
  ticker: string,
  action: 'BUY' | 'SELL',
  quantity: number,
  price: number,
): Promise<void> {
  const { data: existing } = await supabase
    .from('positions')
    .select('*')
    .eq('ticker', ticker)
    .single();

  if (action === 'BUY') {
    if (existing) {
      const pos = existing as { quantity: number; avg_cost: number };
      const newQty = pos.quantity + quantity;
      const newAvgCost = (pos.avg_cost * pos.quantity + price * quantity) / newQty;
      await supabase
        .from('positions')
        .update({ quantity: newQty, avg_cost: +newAvgCost.toFixed(2), updated_at: new Date().toISOString() })
        .eq('ticker', ticker);
    } else {
      await supabase.from('positions').insert({
        ticker,
        quantity,
        avg_cost: price,
        unrealized_pnl: 0,
      });
    }
  } else {
    // SELL: reduce position
    if (existing) {
      const pos = existing as { quantity: number };
      const newQty = Math.max(pos.quantity - quantity, 0);
      await supabase
        .from('positions')
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq('ticker', ticker);
    }
  }
}
