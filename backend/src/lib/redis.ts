import Redis from 'ioredis';
import { logger } from './logger.js';

if (!process.env['REDIS_URL']) {
  throw new Error('Missing REDIS_URL');
}

export const redis = new Redis(process.env['REDIS_URL'], {
  maxRetriesPerRequest: null, // required by BullMQ
  lazyConnect: true,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis error'));

export const redisConfig = {
  host: redis.options.host,
  port: redis.options.port,
  password: redis.options.password,
};
