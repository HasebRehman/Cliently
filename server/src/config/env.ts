import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from workspace root or current directory
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const isProd = process.env.NODE_ENV === 'production';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform((val) => parseInt(val, 10)).default('5000'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TRUST_PROXY: z.string().default('1'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform((val) => parseInt(val, 10)).default('6379'),
  REDIS_PASSWORD: isProd
    ? z.string().min(32, 'In production, REDIS_PASSWORD must be at least 32 characters')
    : z.string().optional(),
  REDIS_URL: z.string().optional(),
  HEALTH_TOKEN: isProd
    ? z.string().min(32, 'In production, HEALTH_TOKEN must be at least 32 characters')
    : z.string().default('dev_health_secret_token_12345'),
  JWT_ACCESS_SECRET: isProd
    ? z.string().min(32, 'In production, JWT_ACCESS_SECRET must be at least 32 characters')
    : z.string().default('super-secret-access-token-key-cliently-12345'),
  JWT_REFRESH_SECRET: isProd
    ? z.string().min(32, 'In production, JWT_REFRESH_SECRET must be at least 32 characters')
    : z.string().default('super-secret-refresh-token-key-cliently-67890'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.string().transform((val) => parseInt(val, 10)).default('1025'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.string().transform((val) => val === 'true').default('false'),
  EMAIL_FROM: z.string().default('no-reply@cliently.local'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRO_PRICE_ID: z.string().optional(),
  JAAS_APP_ID: z.string().optional().default(''),
  JAAS_KEY_ID: z.string().optional().default(''),
  JAAS_PRIVATE_KEY: z.string().optional().default(''),
  GOOGLE_CLIENT_ID: z.string().optional().default(process.env.OAuth_Client_Google_Calendar_id || process.env.GOOGLE_CLIENT_ID || ''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(process.env.OAuth_Client_Google_Calendar_secret || process.env.GOOGLE_CLIENT_SECRET || ''),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional().default(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || ''),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().optional().default(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || ''),
  GEMINI_API_KEY: z.string().optional().default(process.env.GEMINI_API_KEY || ''),
  APP_NAME: z.string().default('Cliently'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  // Sanitize error logging to ensure no secrets or sensitive values are exposed
  const sanitizedErrors = parsedEnv.error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
  console.error('❌ Invalid environment variables:', JSON.stringify(sanitizedErrors, null, 2));
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

export const env = parsedEnv.success ? parsedEnv.data : ({} as z.infer<typeof envSchema>);
