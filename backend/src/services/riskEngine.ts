import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

const MAX_POSITION_SIZE = 0.05;   // 5% of portfolio max
const STOP_LOSS_PCT = 0.02;       // 2% stop-loss
const TAKE_PROFIT_PCT = 0.04;     // 4% take-profit (2:1 R:R minimum)
const MAX_OPEN_POSITIONS = 10;
const CIRCUIT_BREAKER_PCT = 0.03; // -3% daily drawdown triggers pause

export type PositionSizeResult = {
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number;
};

// Fixed fractional position sizing
export const calculatePositionSize = (
  portfolioValue: number,
  entryPrice: number,
  riskFraction = 0.01, // risk 1% of portfolio per trade
): PositionSizeResult => {
  const riskAmount = portfolioValue * riskFraction;
  const stopLossDistance = entryPrice * STOP_LOSS_PCT;
  const quantity = Math.floor(riskAmount / stopLossDistance);
  const cappedQuantity = Math.min(
    quantity,
    Math.floor((portfolioValue * MAX_POSITION_SIZE) / entryPrice),
  );

  return {
    quantity: cappedQuantity,
    stopLoss: +(entryPrice * (1 - STOP_LOSS_PCT)).toFixed(2),
    takeProfit: +(entryPrice * (1 + TAKE_PROFIT_PCT)).toFixed(2),
    riskAmount: +(cappedQuantity * stopLossDistance).toFixed(2),
  };
};

// Check if we've hit the daily drawdown circuit breaker
export const checkCircuitBreaker = async (): Promise<boolean> => {
  const today = new Date().toISOString().split('T')[0];

  const { data: trades } = await supabase
    .from('trades')
    .select('price, quantity, action')
    .gte('created_at', `${today}T00:00:00Z`)
    .eq('status', 'filled');

  if (!trades || trades.length === 0) return false;

  const dailyPnL = trades.reduce((acc, t) => {
    const value = (t as { price: number; quantity: number; action: string }).price *
      (t as { price: number; quantity: number; action: string }).quantity;
    return (t as { action: string }).action === 'SELL' ? acc + value : acc - value;
  }, 0);

  const { data: account } = await supabase
    .from('positions')
    .select('unrealized_pnl');

  const portfolioValue = account?.reduce((acc, p) => acc + (p as { unrealized_pnl: number }).unrealized_pnl, 0) ?? 100000;
  const drawdownPct = Math.abs(dailyPnL) / portfolioValue;

  if (dailyPnL < 0 && drawdownPct >= CIRCUIT_BREAKER_PCT) {
    logger.warn({ dailyPnL, drawdownPct }, 'Circuit breaker triggered — trading paused');
    return true;
  }

  return false;
};

// Check max open positions limit
export const checkMaxPositions = async (): Promise<boolean> => {
  const { count } = await supabase
    .from('positions')
    .select('id', { count: 'exact', head: true })
    .gt('quantity', 0);

  return (count ?? 0) >= MAX_OPEN_POSITIONS;
};
