import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { env } from './config/env.js';
import { requestLogger } from './middlewares/requestLogger.js';
import { errorHandler } from './middlewares/errorHandler.js';
import apiRouter from './routes/index.js';
import { handlePublicHealthCheck, handleDetailedHealthCheck } from './routes/health.routes.js';

export function createApp(): Express {
  const app = express();

  // Trust proxy configuration
  const trustProxySetting =
    env.TRUST_PROXY === 'true'
      ? true
      : env.TRUST_PROXY === 'false'
      ? false
      : isNaN(Number(env.TRUST_PROXY))
      ? env.TRUST_PROXY
      : Number(env.TRUST_PROXY);
  app.set('trust proxy', trustProxySetting);

  // Security Middleware - Allow cross-origin resource loading and iframe document previews
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      frameguard: false,
      contentSecurityPolicy: false,
    })
  );

  // CORS Middleware
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like server-to-server or curl)
        if (!origin) return callback(null, true);
        return callback(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id', 'x-health-token'],
    })
  );

  // Rate Limiting (Skip in test mode)
  if (env.NODE_ENV !== 'test') {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 500, // Limit each IP to 500 requests per windowMs
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP, please try again later.',
        },
      },
    });
    app.use(limiter);
  }

  // Request Logging
  if (env.NODE_ENV !== 'test') {
    app.use(requestLogger);
  }

  // Body and Cookie Parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Root welcome endpoint
  app.get('/', (_req, res) => {
    res.json({
      success: true,
      name: 'Cliently API Server',
      status: 'healthy',
      version: '1.0.0',
      message: 'Welcome to Cliently API. API endpoints are available at /api/v1',
    });
  });

  // Direct Public & Internal Health check endpoints
  app.get('/health', handlePublicHealthCheck);
  app.get('/health/detail', handleDetailedHealthCheck);

  // Serve static uploads (chat attachments, avatars)
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Mount API Router under /api/v1
  app.use('/api/v1', apiRouter);

  // 404 handler for undefined routes
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Route ${req.method} ${req.originalUrl} not found`,
      },
    });
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
