import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateWithdrawalAmount } from '../services/harvestService.js';

// Static mock for the module-level import
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('calculateWithdrawalAmount', () => {
  it('returns full realized P&L when reserve allows', () => {
    // portfolioValue=100000, reservePct=20 => minReserve=20000, available=80000
    // realizedPnL=500 < 80000 => withdrawal = 500
    const result = calculateWithdrawalAmount(500, 100_000, 20);
    expect(result).toBe(500);
  });

  it('caps withdrawal to not breach reserve floor', () => {
    // portfolioValue=1000, reservePct=20 => minReserve=200, available=800
    // realizedPnL=900 > 800 => withdrawal = 800
    const result = calculateWithdrawalAmount(900, 1000, 20);
    expect(result).toBe(800);
  });

  it('returns 0 when portfolio is at reserve limit', () => {
    // portfolioValue=100, reservePct=100 => minReserve=100, available=0
    const result = calculateWithdrawalAmount(50, 100, 100);
    expect(result).toBe(0);
  });

  it('handles $200 portfolio with 20% reserve', () => {
    // portfolioValue=200, reservePct=20 => minReserve=40, available=160
    // realizedPnL=25 < 160 => withdrawal = 25
    const result = calculateWithdrawalAmount(25, 200, 20);
    expect(result).toBe(25);
  });

  it('handles zero reserve percentage', () => {
    // portfolioValue=1000, reservePct=0 => minReserve=0, available=1000
    // realizedPnL=500 < 1000 => withdrawal = 500
    const result = calculateWithdrawalAmount(500, 1000, 0);
    expect(result).toBe(500);
  });

  it('rounds to 2 decimal places', () => {
    const result = calculateWithdrawalAmount(33.337, 1000, 20);
    expect(result).toBe(33.34);
  });
});

describe('evaluateHarvest', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('skips evaluation when disabled', async () => {
    vi.doMock('../lib/supabase.js', () => ({
      supabase: { from: vi.fn() },
    }));
    vi.doMock('../lib/logger.js', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { evaluateHarvest } = await import('../services/harvestService.js');
    // Should return without calling supabase at all
    await evaluateHarvest({
      id: '1',
      fixedAmount: 500,
      pctReturn: 0.05,
      reservePct: 20,
      cooldownDays: 7,
      enabled: false,
      updatedAt: '',
    });
    // If it didn't throw, it exited early — success
  });

  it('skips when cooldown is active', async () => {
    const loggerMock = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    // Mock: last withdrawal was 2 days ago, realized P&L = 600
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'withdrawals') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
                      error: null,
                    }),
                  }),
                }),
              }),
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'trades') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({
                  data: [{ price: 110, quantity: 10, action: 'SELL' }, { price: 100, quantity: 10, action: 'BUY' }],
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null }) };
      }),
    };

    vi.doMock('../lib/supabase.js', () => ({ supabase: mockSupabase }));
    vi.doMock('../lib/logger.js', () => ({ logger: loggerMock }));

    const { evaluateHarvest } = await import('../services/harvestService.js');
    await evaluateHarvest({
      id: '1',
      fixedAmount: 500,
      pctReturn: 0.05,
      reservePct: 20,
      cooldownDays: 7, // 7 days required, only 2 elapsed
      enabled: true,
      updatedAt: '',
    });

    // Should log cooldown skip
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.objectContaining({ daysSinceLast: expect.any(Number), required: 7 }),
      'Harvest skipped — cooldown active',
    );
  });
});

describe('getRealizedPnLSinceLastHarvest', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('sums SELL as positive and BUY as negative', async () => {
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'withdrawals') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'trades') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({
                  data: [
                    { price: 100, quantity: 10, action: 'BUY' },   // -1000
                    { price: 120, quantity: 10, action: 'SELL' },  // +1200
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    vi.doMock('../lib/supabase.js', () => ({ supabase: mockSupabase }));
    vi.doMock('../lib/logger.js', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { getRealizedPnLSinceLastHarvest } = await import('../services/harvestService.js');
    const pnl = await getRealizedPnLSinceLastHarvest();
    expect(pnl).toBe(200); // 1200 - 1000
  });

  it('returns 0 when no trades exist', async () => {
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'withdrawals') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'trades') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    vi.doMock('../lib/supabase.js', () => ({ supabase: mockSupabase }));
    vi.doMock('../lib/logger.js', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { getRealizedPnLSinceLastHarvest } = await import('../services/harvestService.js');
    const pnl = await getRealizedPnLSinceLastHarvest();
    expect(pnl).toBe(0);
  });
});
