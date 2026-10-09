import { Redis } from 'ioredis';
import { env } from '../config/env.js';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    if (env.REDIS_URL) {
      redisClient = new Redis(env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
    } else {
      redisClient = new Redis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
    }

    redisClient.on('error', (err) => {
      console.warn('⚠️ Redis connection warning:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('🔌 Redis connected successfully');
    });
  }

  return redisClient;
}
