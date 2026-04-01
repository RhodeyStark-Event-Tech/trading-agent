import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculatePositionSize } from '../services/riskEngine.js';

// Mock supabase before importing modules that use it
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('calculatePositionSize', () => {
  it('calculates correct quantity for a standard trade', () => {
    const result = calculatePositionSize(100_000, 150);
    // riskAmount = 100000 * 0.01 = 1000
    // stopLossDistance = 150 * 0.02 = 3
    // quantity = floor(1000 / 3) = 333
    // maxByCap = floor(100000 * 0.05 / 150) = 33
    // capped = min(333, 33) = 33
    expect(result.quantity).toBe(33);
    expect(result.stopLoss).toBe(+(150 * 0.98).toFixed(2));
    expect(result.takeProfit).toBe(+(150 * 1.04).toFixed(2));
  });

  it('respects the 5% max position size cap', () => {
    const result = calculatePositionSize(10_000, 50);
    // maxByCap = floor(10000 * 0.05 / 50) = 10
    expect(result.quantity).toBeLessThanOrEqual(10);
  });

  it('uses custom risk fraction', () => {
    const result = calculatePositionSize(100_000, 100, 0.005);
    // riskAmount = 100000 * 0.005 = 500
    // stopLossDistance = 100 * 0.02 = 2
    // quantity = floor(500 / 2) = 250
    // maxByCap = floor(100000 * 0.05 / 100) = 50
    // capped = min(250, 50) = 50
    expect(result.quantity).toBe(50);
  });

  it('returns zero quantity for very high-priced stock with small portfolio', () => {
    const result = calculatePositionSize(200, 5000);
    // maxByCap = floor(200 * 0.05 / 5000) = floor(0.002) = 0
    expect(result.quantity).toBe(0);
  });

  it('calculates correct stop-loss and take-profit', () => {
    const result = calculatePositionSize(50_000, 200);
    expect(result.stopLoss).toBe(196.00); // 200 * 0.98
    expect(result.takeProfit).toBe(208.00); // 200 * 1.04
  });

  it('risk amount reflects actual capped quantity', () => {
    const result = calculatePositionSize(100_000, 150);
    const stopLossDistance = 150 * 0.02;
    expect(result.riskAmount).toBe(+(result.quantity * stopLossDistance).toFixed(2));
  });

  it('handles $200 portfolio (user starting balance)', () => {
    const result = calculatePositionSize(200, 25);
    // riskAmount = 200 * 0.01 = 2
    // stopLossDistance = 25 * 0.02 = 0.5
    // quantity = floor(2 / 0.5) = 4
    // maxByCap = floor(200 * 0.05 / 25) = floor(0.4) = 0
    // capped = 0 (can't buy even 1 share at 5% cap)
    expect(result.quantity).toBe(0);
  });

  it('handles fractional-friendly prices with small portfolio', () => {
    const result = calculatePositionSize(200, 5);
    // riskAmount = 200 * 0.01 = 2
    // stopLossDistance = 5 * 0.02 = 0.1
    // quantity = floor(2 / 0.1) = 20
    // maxByCap = floor(200 * 0.05 / 5) = 2
    // capped = 2
    expect(result.quantity).toBe(2);
  });
});

describe('checkCircuitBreaker', () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>;

  function createSupabaseMock() {
    const chainable: Record<string, ReturnType<typeof vi.fn>> = {};
    chainable['select'] = vi.fn(() => chainable);
    chainable['gte'] = vi.fn(() => chainable);
    chainable['eq'] = vi.fn(() => chainable);
    chainable['gt'] = vi.fn(() => chainable);
    const fromFn = vi.fn(() => chainable);
    return { from: fromFn, chainable };
  }

  beforeEach(async () => {
    vi.resetModules();
    supabaseMock = createSupabaseMock();
    vi.doMock('../lib/supabase.js', () => ({ supabase: supabaseMock }));
    vi.doMock('../lib/logger.js', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
  });

  it('returns false when no trades today', async () => {
    const mockChain: Record<string, ReturnType<typeof vi.fn>> = {};
    mockChain['select'] = vi.fn(() => mockChain);
    mockChain['gte'] = vi.fn(() => mockChain);
    mockChain['eq'] = vi.fn(() => {
      return Promise.resolve({ data: [], error: null });
    });
    mockChain['gt'] = vi.fn(() => mockChain);

    vi.doMock('../lib/supabase.js', () => ({
      supabase: { from: vi.fn(() => mockChain) },
    }));
    vi.doMock('../lib/logger.js', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { checkCircuitBreaker } = await import('../services/riskEngine.js');
    const result = await checkCircuitBreaker();
    expect(result).toBe(false);
  });

  it('returns true when daily drawdown exceeds 3%', async () => {
    // First from('trades') call chain: select -> gte -> eq resolves with trade data
    // Second from('positions') call chain: select resolves with positions
    let callCount = 0;
    const mockChain: Record<string, ReturnType<typeof vi.fn>> = {};
    mockChain['select'] = vi.fn(() => mockChain);
    mockChain['gte'] = vi.fn(() => mockChain);
    mockChain['eq'] = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        // trades query resolves
        return Promise.resolve({
          data: [
            { price: 100, quantity: 50, action: 'BUY' },
            { price: 90, quantity: 50, action: 'SELL' },
          ],
          error: null,
        });
      }
      return mockChain;
    });
    mockChain['gt'] = vi.fn(() => mockChain);

    const mockFrom = vi.fn((table: string) => {
      if (table === 'positions') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ unrealized_pnl: 10000 }],
            error: null,
          }),
        };
      }
      return mockChain;
    });

    vi.doMock('../lib/supabase.js', () => ({ supabase: { from: mockFrom } }));
    vi.doMock('../lib/logger.js', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { checkCircuitBreaker } = await import('../services/riskEngine.js');
    const result = await checkCircuitBreaker();
    expect(result).toBe(true);
  });

  it('returns false when drawdown is within limits', async () => {
    let callCount = 0;
    const mockChain: Record<string, ReturnType<typeof vi.fn>> = {};
    mockChain['select'] = vi.fn(() => mockChain);
    mockChain['gte'] = vi.fn(() => mockChain);
    mockChain['eq'] = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          data: [
            { price: 100, quantity: 10, action: 'BUY' },
            { price: 99, quantity: 10, action: 'SELL' },
          ],
          error: null,
        });
      }
      return mockChain;
    });
    mockChain['gt'] = vi.fn(() => mockChain);

    const mockFrom = vi.fn((table: string) => {
      if (table === 'positions') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ unrealized_pnl: 50000 }],
            error: null,
          }),
        };
      }
      return mockChain;
    });

    vi.doMock('../lib/supabase.js', () => ({ supabase: { from: mockFrom } }));
    vi.doMock('../lib/logger.js', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { checkCircuitBreaker } = await import('../services/riskEngine.js');
    const result = await checkCircuitBreaker();
    expect(result).toBe(false);
  });
});

describe('checkMaxPositions', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns true when at max positions (10)', async () => {
    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            gt: vi.fn().mockResolvedValue({ count: 10, error: null }),
          }),
        }),
      },
    }));
    vi.doMock('../lib/logger.js', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { checkMaxPositions } = await import('../services/riskEngine.js');
    expect(await checkMaxPositions()).toBe(true);
  });

  it('returns false when below max positions', async () => {
    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            gt: vi.fn().mockResolvedValue({ count: 5, error: null }),
          }),
        }),
      },
    }));
    vi.doMock('../lib/logger.js', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { checkMaxPositions } = await import('../services/riskEngine.js');
    expect(await checkMaxPositions()).toBe(false);
  });
});
