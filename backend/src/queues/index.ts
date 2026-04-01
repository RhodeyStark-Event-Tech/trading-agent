import { Queue, Worker, type Job } from 'bullmq';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { runSentimentAgent } from '../agents/sentimentAgent.js';
import { runMetaAgent } from '../agents/metaAgent.js';
import { runEducationAgent, type EducationAgentInput } from '../agents/educationAgent.js';
import { evaluateHarvest } from '../services/harvestService.js';
import { supabase } from '../lib/supabase.js';
import type { HarvestConfig } from '@trading-agent/types';

const connection = { host: redis.options.host, port: redis.options.port, password: redis.options.password };
const JOB_OPTIONS = { attempts: 3, backoff: { type: 'exponential' as const, delay: 2000 } };

// ─── Queues ───────────────────────────────────────────────────────────────────

export const sentimentQueue = new Queue('sentiment', { connection });
export const metaQueue = new Queue('meta', { connection });
export const harvestQueue = new Queue('harvest', { connection });
export const educationQueue = new Queue('education', { connection });

// ─── Workers ──────────────────────────────────────────────────────────────────

const sentimentWorker = new Worker(
  'sentiment',
  async (job: Job) => {
    const { headlines, tickers } = job.data as { headlines: string[]; tickers: string[] };
    const output = await runSentimentAgent(headlines, tickers);

    // Persist signal to DB
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

    // Persist meta signal
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

    // Guard against duplicate cards
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

// ─── Error Handlers ───────────────────────────────────────────────────────────

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

// ─── Recurring Schedules ──────────────────────────────────────────────────────

export const initQueues = async (): Promise<void> => {
  // Harvest evaluation — daily at market close (4:30 PM ET)
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
