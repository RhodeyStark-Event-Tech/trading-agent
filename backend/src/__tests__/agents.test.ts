import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('runSentimentAgent', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns parsed sentiment output from Claude', async () => {
    const mockResponse = {
      content: [{
        type: 'text',
        text: '{"sentiment":"bullish","confidence":0.88,"tickers":["AAPL"],"rationale":"Apple beat earnings estimates with strong iPhone and services revenue growth"}',
      }],
      usage: { input_tokens: 200, output_tokens: 50 },
    };

    vi.doMock('../lib/anthropic.js', () => ({
      anthropic: {
        messages: { create: vi.fn().mockResolvedValue(mockResponse) },
      },
      AGENT_MODEL: 'claude-sonnet-4-20250514',
      AGENT_MAX_TOKENS: 1000,
    }));

    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
              }),
            }),
          }),
        }),
      },
    }));

    const { runSentimentAgent } = await import('../agents/sentimentAgent.js');
    const result = await runSentimentAgent(
      ['Apple beats Q4 earnings estimates'],
      ['AAPL'],
    );

    expect(result.sentiment).toBe('bullish');
    expect(result.confidence).toBe(0.88);
    expect(result.tickers).toEqual(['AAPL']);
    expect(result.rationale).toBeTruthy();
  });

  it('uses fallback prompt when DB prompt is missing', async () => {
    const createMock = vi.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: '{"sentiment":"neutral","confidence":0.5,"tickers":["MSFT"],"rationale":"Mixed signals from earnings report with revenue beat but guidance concerns"}',
      }],
      usage: { input_tokens: 200, output_tokens: 50 },
    });

    vi.doMock('../lib/anthropic.js', () => ({
      anthropic: { messages: { create: createMock } },
      AGENT_MODEL: 'claude-sonnet-4-20250514',
      AGENT_MAX_TOKENS: 1000,
    }));

    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
              }),
            }),
          }),
        }),
      },
    }));

    const { runSentimentAgent } = await import('../agents/sentimentAgent.js');
    await runSentimentAgent(['MSFT earnings mixed'], ['MSFT']);

    // Verify it called Claude with the fallback system prompt
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('financial sentiment analysis expert'),
      }),
    );
  });

  it('throws on invalid LLM output', async () => {
    vi.doMock('../lib/anthropic.js', () => ({
      anthropic: {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: '{"invalid":"response"}' }],
            usage: { input_tokens: 100, output_tokens: 20 },
          }),
        },
      },
      AGENT_MODEL: 'claude-sonnet-4-20250514',
      AGENT_MAX_TOKENS: 1000,
    }));

    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      },
    }));

    const { runSentimentAgent } = await import('../agents/sentimentAgent.js');
    await expect(runSentimentAgent(['test'], ['TEST'])).rejects.toThrow();
  });
});

describe('runMetaAgent', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('synthesizes signals into a trade decision', async () => {
    const mockResponse = {
      content: [{
        type: 'text',
        text: '{"action":"BUY","ticker":"AAPL","size":0.03,"horizon":"swing","confidence":0.85,"rationale":"Strong alignment across sentiment, technical, and fundamental signals supports a swing buy position"}',
      }],
      usage: { input_tokens: 500, output_tokens: 80 },
    };

    vi.doMock('../lib/anthropic.js', () => ({
      anthropic: { messages: { create: vi.fn().mockResolvedValue(mockResponse) } },
      AGENT_MODEL: 'claude-sonnet-4-20250514',
      AGENT_MAX_TOKENS: 1000,
    }));

    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      },
    }));

    const { runMetaAgent } = await import('../agents/metaAgent.js');
    const result = await runMetaAgent({
      ticker: 'AAPL',
      sentiment: {
        sentiment: 'bullish',
        confidence: 0.9,
        tickers: ['AAPL'],
        rationale: 'Positive earnings',
      },
      technical: {
        pattern: 'breakout',
        signal: 'BUY',
        entry: 185.50,
        rationale: 'Breaking above resistance',
      },
    });

    expect(result.action).toBe('BUY');
    expect(result.ticker).toBe('AAPL');
    expect(result.size).toBe(0.03);
    expect(result.size).toBeLessThanOrEqual(0.05);
    expect(result.horizon).toBe('swing');
  });

  it('handles HOLD decision when signals conflict', async () => {
    const mockResponse = {
      content: [{
        type: 'text',
        text: '{"action":"HOLD","ticker":"TSLA","size":0,"horizon":"intraday","confidence":0.4,"rationale":"Conflicting signals between bullish sentiment and bearish technical pattern suggest staying on sidelines"}',
      }],
      usage: { input_tokens: 500, output_tokens: 80 },
    };

    vi.doMock('../lib/anthropic.js', () => ({
      anthropic: { messages: { create: vi.fn().mockResolvedValue(mockResponse) } },
      AGENT_MODEL: 'claude-sonnet-4-20250514',
      AGENT_MAX_TOKENS: 1000,
    }));

    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      },
    }));

    const { runMetaAgent } = await import('../agents/metaAgent.js');
    const result = await runMetaAgent({
      ticker: 'TSLA',
      sentiment: { sentiment: 'bullish', confidence: 0.7, tickers: ['TSLA'], rationale: 'Positive delivery numbers' },
      technical: { pattern: 'head and shoulders', signal: 'SELL', entry: 250, rationale: 'Bearish reversal pattern' },
    });

    expect(result.action).toBe('HOLD');
    expect(result.size).toBe(0);
  });

  it('works with partial inputs (only sentiment)', async () => {
    const createMock = vi.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: '{"action":"BUY","ticker":"NVDA","size":0.02,"horizon":"long","confidence":0.6,"rationale":"Bullish sentiment alone warrants small position with limited conviction"}',
      }],
      usage: { input_tokens: 300, output_tokens: 60 },
    });

    vi.doMock('../lib/anthropic.js', () => ({
      anthropic: { messages: { create: createMock } },
      AGENT_MODEL: 'claude-sonnet-4-20250514',
      AGENT_MAX_TOKENS: 1000,
    }));

    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      },
    }));

    const { runMetaAgent } = await import('../agents/metaAgent.js');
    const result = await runMetaAgent({
      ticker: 'NVDA',
      sentiment: { sentiment: 'bullish', confidence: 0.75, tickers: ['NVDA'], rationale: 'AI demand surge' },
    });

    expect(result.action).toBe('BUY');
    // Verify the prompt includes "Not available" for missing inputs
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('Not available'),
          }),
        ]),
      }),
    );
  });
});
