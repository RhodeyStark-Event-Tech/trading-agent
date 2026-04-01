import Redis from 'ioredis';
import { logger } from './logger.js';

const REDIS_URL = process.env['REDIS_URL'];

let redisInstance: Redis | null = null;

if (REDIS_URL) {
  try {
    redisInstance = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      retryStrategy: () => null, // don't retry — fail gracefully
    });
    redisInstance.on('connect', () => logger.info('Redis connected'));
    redisInstance.on('error', () => {}); // swallow errors to prevent crash
  } catch {
    logger.warn('Failed to create Redis client — queues disabled');
    redisInstance = null;
  }
} else {
  logger.warn('No REDIS_URL set — background queues disabled');
}

export const redis = redisInstance;

