import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { getRedisClient } from '../lib/redis.js';
import { env } from '../config/env.js';
import { timingSafeCompare } from '../utils/crypto.js';

const router = Router();

async function checkDatabaseHealth(): Promise<string> {
  const timeoutPromise = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error('Database connection timed out after 2000ms')), 2000)
  );

  const queryPromise = (async () => {
    await prisma.$queryRaw`SELECT 1`;
    return 'connected';
  })();

  return Promise.race([queryPromise, timeoutPromise]);
}

async function checkRedisHealth(): Promise<string> {
  const timeoutPromise = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error('Redis connection timed out after 1500ms')), 1500)
  );

  const pingPromise = (async () => {
    const redis = getRedisClient();
    const result = await redis.ping();
    return result === 'PONG' ? 'connected' : 'unexpected response';
  })();

  return Promise.race([pingPromise, timeoutPromise]);
}

// 1. Public Health Check Endpoint: returns only { status: "ok" }
export const handlePublicHealthCheck = (_req: Request, res: Response): void => {
  res.status(200).json({ status: 'ok' });
};

// 2. Internal Detailed Health Check Endpoint (Secured by HEALTH_TOKEN)
export const handleDetailedHealthCheck = async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers['x-health-token'] || req.headers['authorization'];
  const providedToken =
    typeof authHeader === 'string'
      ? authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : authHeader.trim()
      : undefined;

  if (!providedToken || !timingSafeCompare(providedToken, env.HEALTH_TOKEN)) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing health check token in x-health-token or Authorization header.',
      },
    });
    return;
  }

  const startTime = Date.now();
  let dbStatus = 'disconnected';
  let redisStatus = 'disconnected';

  // Check Database
  try {
    dbStatus = await checkDatabaseHealth();
  } catch (error) {
    dbStatus = `unavailable (${error instanceof Error ? error.message : 'Unknown'})`;
  }

  // Check Redis
  try {
    redisStatus = await checkRedisHealth();
  } catch (error) {
    redisStatus = `unavailable (${error instanceof Error ? error.message : 'Unknown'})`;
  }

  const isHealthy = dbStatus === 'connected';
  const responseTimeMs = Date.now() - startTime;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    service: 'Cliently API Internal Health',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    responseTimeMs,
    services: {
      database: dbStatus,
      redis: redisStatus,
    },
    memory: {
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  });
};

router.get('/', handlePublicHealthCheck);
router.get('/health', handlePublicHealthCheck);
router.get('/detail', handleDetailedHealthCheck);
router.get('/detailed', handleDetailedHealthCheck);

export default router;
