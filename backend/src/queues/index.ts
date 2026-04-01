import { Queue, Worker, type Job } from 'bullmq';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { runSentimentAgent } from '../agents/sentimentAgent.js';
import { runMetaAgent } from '../agents/metaAgent.js';
import { runEducationAgent, type EducationAgentInput } from '../agents/educationAgent.js';
import { evaluateHarvest } from '../services/harvestService.js';
import { supabase } from '../lib/supabase.js';
import type { HarvestConfig } from '@trading-agent/types';

const JOB_OPTIONS = { attempts: 3, backoff: { type: 'exponential' as const, delay: 2000 } };

// ─── Queues (null if Redis unavailable) ──────────────────────────────────────

export let sentimentQueue: Queue | null = null;
export let metaQueue: Queue | null = null;
export let harvestQueue: Queue | null = null;
export let educationQueue: Queue | null = null;

let queuesReady = false;

if (redis) {
  try {
    const connection = redis;
    sentimentQueue = new Queue('sentiment', { connection });
    metaQueue = new Queue('meta', { connection });
    harvestQueue = new Queue('harvest', { connection });
    educationQueue = new Queue('education', { connection });
    queuesReady = true;
  } catch (err) {
    logger.warn({ err }, 'Failed to create BullMQ queues — background workers disabled');
  }
}

// ─── Workers ──────────────────────────────────────────────────────────────────

if (queuesReady && redis) {
  const connection = redis;
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

  const metaWorker = new Worker(
    'meta',
    async (job: Job) => {
      const input = job.data as Parameters<typeof runMetaAgent>[0];
      const output = await runMetaAgent(input);

      await supabase.from('signals').insert({
        ticker: output.ticker,
        agent: 'meta',
        action: output.action,
        confidence: output.confidence,
        rationale: output,
      });

      return output;
    },
    { connection },
  );

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

  const harvestWorker = new Worker(
    'harvest',
    async (_job: Job) => {
      const { data: config } = await supabase
        .from('harvest_config')
        .select('*')
        .single();

      if (!config) return;
      await evaluateHarvest(config as HarvestConfig);
    },
    { connection },
  );

  for (const [name, worker] of [
    ['sentiment', sentimentWorker],
    ['meta', metaWorker],
    ['education', educationWorker],
    ['harvest', harvestWorker],
  ] as const) {
    worker.on('failed', (job, err) => {
      logger.error({ agent: name, jobId: job?.id, err }, 'Worker job failed');
    });
    worker.on('completed', (job) => {
      logger.debug({ agent: name, jobId: job.id }, 'Worker job completed');
    });
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

export const initQueues = async (): Promise<void> => {
  if (!harvestQueue) {
    logger.warn('Redis not available — background queues disabled');
    return;
  }

  await harvestQueue.add(
    'daily-harvest-check',
    {},
    {
      repeat: { pattern: '30 16 * * 1-5', tz: 'America/New_York' },
      ...JOB_OPTIONS,
    },
  );

  logger.info('BullMQ queues and workers initialized');
};
