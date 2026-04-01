import { Queue, Worker, type Job } from 'bullmq';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { runSentimentAgent } from '../agents/sentimentAgent.js';
import { runTechnicalAgent, type TechnicalAgentInput } from '../agents/technicalAgent.js';
import { runFundamentalAgent, type FundamentalAgentInput } from '../agents/fundamentalAgent.js';
import { runMetaAgent } from '../agents/metaAgent.js';
import { runEducationAgent, type EducationAgentInput } from '../agents/educationAgent.js';
import { fetchHeadlines } from '../services/newsService.js';
import { getQuote, getOHLCV, getIndicators, getFundamentals } from '../services/marketDataService.js';
import { executeSignal } from '../services/tradeExecutionService.js';
import { evaluateHarvest } from '../services/harvestService.js';
import { supabase } from '../lib/supabase.js';
import type { HarvestConfig, SentimentAgentOutput, TechnicalAgentOutput, FundamentalAgentOutput } from '@trading-agent/types';

const JOB_OPTIONS = { attempts: 3, backoff: { type: 'exponential' as const, delay: 2000 } };

// Default watchlist
const WATCHLIST = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'V', 'JNJ'];

// ─── Queues (null if Redis unavailable) ──────────────────────────────────────

export let sentimentQueue: Queue | null = null;
export let technicalQueue: Queue | null = null;
export let fundamentalQueue: Queue | null = null;
export let metaQueue: Queue | null = null;
export let harvestQueue: Queue | null = null;
export let educationQueue: Queue | null = null;
export let pipelineQueue: Queue | null = null;

let queuesReady = false;

if (redis) {
  try {
    const connection = redis;
    sentimentQueue = new Queue('sentiment', { connection });
    technicalQueue = new Queue('technical', { connection });
    fundamentalQueue = new Queue('fundamental', { connection });
    metaQueue = new Queue('meta', { connection });
    harvestQueue = new Queue('harvest', { connection });
    educationQueue = new Queue('education', { connection });
    pipelineQueue = new Queue('pipeline', { connection });
    queuesReady = true;
  } catch (err) {
    logger.warn({ err }, 'Failed to create BullMQ queues — background workers disabled');
  }
}

// ─── Workers ──────────────────────────────────────────────────────────────────

if (queuesReady && redis) {
  const connection = redis;

  // ── Sentiment Worker ─────────────────────────────────────────────────────
  const sentimentWorker = new Worker(
    'sentiment',
    async (job: Job) => {
      const { headlines, tickers } = job.data as { headlines: string[]; tickers: string[] };
      const output = await runSentimentAgent(headlines, tickers);

      await supabase.from('signals').insert({
        ticker: output.tickers[0] ?? 'MULTI',
        agent: 'sentiment',
        action: output.sentiment === 'bullish' ? 'BUY' : output.sentiment === 'bearish' ? 'SELL' : 'HOLD',
        confidence: output.confidence,
        rationale: output,
      });

      return output;
    },
    { connection },
  );

  // ── Technical Worker ─────────────────────────────────────────────────────
  const technicalWorker = new Worker(
    'technical',
    async (job: Job) => {
      const input = job.data as TechnicalAgentInput;
      const output = await runTechnicalAgent(input);

      await supabase.from('signals').insert({
        ticker: input.ticker,
        agent: 'technical',
        action: output.signal,
        confidence: output.signal === 'HOLD' ? 0.3 : 0.7,
        rationale: output,
      });

      return output;
    },
    { connection },
  );

  // ── Fundamental Worker ───────────────────────────────────────────────────
  const fundamentalWorker = new Worker(
    'fundamental',
    async (job: Job) => {
      const input = job.data as FundamentalAgentInput;
      const output = await runFundamentalAgent(input);

      const action = output.fairValue > input.currentPrice * 1.1 ? 'BUY'
        : output.fairValue < input.currentPrice * 0.9 ? 'SELL'
        : 'HOLD';

      await supabase.from('signals').insert({
        ticker: input.ticker,
        agent: 'fundamental',
        action,
        confidence: Math.abs(output.fairValue - input.currentPrice) / input.currentPrice,
        rationale: output,
      });

      return output;
    },
    { connection },
  );

  // ── Meta Worker (synthesize + execute) ───────────────────────────────────
  const metaWorker = new Worker(
    'meta',
    async (job: Job) => {
      const { ticker, sentiment, technical, fundamental } = job.data as {
        ticker: string;
        sentiment?: SentimentAgentOutput;
        technical?: TechnicalAgentOutput;
        fundamental?: FundamentalAgentOutput;
      };

      const output = await runMetaAgent({ ticker, sentiment, technical, fundamental });

      // Persist meta signal
      const { data: signalRow } = await supabase.from('signals').insert({
        ticker: output.ticker,
        agent: 'meta',
        action: output.action,
        confidence: output.confidence,
        rationale: output,
      }).select('id').single();

      // Execute the trade if actionable
      if (output.action !== 'HOLD' && signalRow) {
        const quote = await getQuote(ticker);
        await executeSignal(
          { ...output, signalId: (signalRow as { id: string }).id },
          quote.price,
        );
      }

      return output;
    },
    { connection },
  );

  // ── Education Worker ─────────────────────────────────────────────────────
  const educationWorker = new Worker(
    'education',
    async (job: Job) => {
      const { tradeId, ...input } = job.data as EducationAgentInput & { tradeId: string };

      const { count } = await supabase
        .from('education_cards')
        .select('id', { count: 'exact', head: true })
        .eq('trade_id', tradeId);

      if ((count ?? 0) > 0) {
        logger.info({ tradeId }, 'Education card already exists — skipping');
        return;
      }

      const output = await runEducationAgent(input);

      await supabase.from('education_cards').insert({
        trade_id: tradeId,
        ticker: input.ticker,
        action: input.action,
        company_name: output.companyName,
        company_overview: output.companyOverview,
        trade_rationale: output.tradeRationale,
        concept_title: output.conceptTitle,
        concept_explanation: output.conceptExplanation,
        risk_note: output.riskNote,
        difficulty: output.difficulty,
        tags: output.tags,
      });

      logger.info({ tradeId, ticker: input.ticker, concept: output.conceptTitle }, 'Education card created');
      return output;
    },
    { connection },
  );

  // ── Harvest Worker ───────────────────────────────────────────────────────
  const harvestWorker = new Worker(
    'harvest',
    async (_job: Job) => {
      const { data: config } = await supabase
        .from('harvest_config')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (!config?.[0]) return;
      await evaluateHarvest(config[0] as HarvestConfig);
    },
    { connection },
  );

  // ── Pipeline Worker (orchestrates full analysis for a ticker) ────────────
  const pipelineWorker = new Worker(
    'pipeline',
    async (job: Job) => {
      const { ticker } = job.data as { ticker: string };
      logger.info({ ticker }, 'Running full analysis pipeline');

      // 1. Fetch data in parallel
      const [quote, candles, fundamentals, newsData] = await Promise.all([
        getQuote(ticker),
        getOHLCV(ticker),
        getFundamentals(ticker),
        fetchHeadlines([ticker]),
      ]);

      const indicators = await getIndicators(candles);
      const headlines = newsData[0]?.headlines ?? [];

      // 2. Run all 3 agents in parallel
      const [sentimentResult, technicalResult, fundamentalResult] = await Promise.allSettled([
        runSentimentAgent(headlines, [ticker]),
        runTechnicalAgent({ ticker, candles, indicators, currentPrice: quote.price }),
        runFundamentalAgent({ ticker, currentPrice: quote.price, metrics: fundamentals, recentNews: headlines }),
      ]);

      const sentiment = sentimentResult.status === 'fulfilled' ? sentimentResult.value : undefined;
      const technical = technicalResult.status === 'fulfilled' ? technicalResult.value : undefined;
      const fundamental = fundamentalResult.status === 'fulfilled' ? fundamentalResult.value : undefined;

      // 3. Store individual signals
      if (sentiment) {
        await supabase.from('signals').insert({
          ticker, agent: 'sentiment',
          action: sentiment.sentiment === 'bullish' ? 'BUY' : sentiment.sentiment === 'bearish' ? 'SELL' : 'HOLD',
          confidence: sentiment.confidence, rationale: sentiment,
        });
      }
      if (technical) {
        await supabase.from('signals').insert({
          ticker, agent: 'technical',
          action: technical.signal, confidence: 0.7, rationale: technical,
        });
      }
      if (fundamental) {
        const fAction = fundamental.fairValue > quote.price * 1.1 ? 'BUY'
          : fundamental.fairValue < quote.price * 0.9 ? 'SELL' : 'HOLD';
        await supabase.from('signals').insert({
          ticker, agent: 'fundamental',
          action: fAction,
          confidence: Math.min(Math.abs(fundamental.fairValue - quote.price) / quote.price, 1),
          rationale: fundamental,
        });
      }

      // 4. Run meta agent to synthesize and (maybe) execute
      await metaQueue?.add(`meta-${ticker}`, { ticker, sentiment, technical, fundamental }, JOB_OPTIONS);

      logger.info({ ticker, hasSentiment: !!sentiment, hasTechnical: !!technical, hasFundamental: !!fundamental },
        'Pipeline complete — meta agent queued');
    },
    { connection, concurrency: 3 },
  );

  // ── Error Handlers ─────────────────────────────────────────────────────
  for (const [name, worker] of [
    ['sentiment', sentimentWorker],
    ['technical', technicalWorker],
    ['fundamental', fundamentalWorker],
    ['meta', metaWorker],
    ['education', educationWorker],
    ['harvest', harvestWorker],
    ['pipeline', pipelineWorker],
  ] as const) {
    worker.on('failed', (job, err) => {
      logger.error({ agent: name, jobId: job?.id, err }, 'Worker job failed');
    });
    worker.on('completed', (job) => {
      logger.debug({ agent: name, jobId: job.id }, 'Worker job completed');
    });
  }
}

// ─── Init: Scheduled Jobs ────────────────────────────────────────────────────

export const initQueues = async (): Promise<void> => {
  if (!pipelineQueue || !harvestQueue) {
    logger.warn('Redis not available — background queues disabled');
    return;
  }

  // Run full pipeline for each watchlist ticker every 15 minutes during market hours
  for (const ticker of WATCHLIST) {
    await pipelineQueue.add(
      `pipeline-${ticker}`,
      { ticker },
      {
        repeat: { pattern: '*/15 9-16 * * 1-5', tz: 'America/New_York' }, // Every 15min, 9AM-4PM ET, Mon-Fri
        ...JOB_OPTIONS,
      },
    );
  }

  // Harvest evaluation — daily at market close (4:30 PM ET)
  await harvestQueue.add(
    'daily-harvest-check',
    {},
    {
      repeat: { pattern: '30 16 * * 1-5', tz: 'America/New_York' },
      ...JOB_OPTIONS,
    },
  );

  logger.info({ watchlist: WATCHLIST }, 'BullMQ queues initialized — pipeline scheduled for watchlist');
};
