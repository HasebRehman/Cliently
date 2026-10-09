import { describe, it, expect } from 'vitest';
import { envSchema } from '../config/env.js';

describe('Environment Schema Validation', () => {
  it('should fail when DATABASE_URL is missing', () => {
    const invalidEnv = {
      NODE_ENV: 'development',
      PORT: '5000',
    };

    const result = envSchema.safeParse(invalidEnv);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errorPaths = result.error.errors.map((e) => e.path.join('.'));
      expect(errorPaths).toContain('DATABASE_URL');
    }
  });

  it('should successfully parse valid configuration and assign defaults', () => {
    const validEnv = {
      DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/cliently_test?schema=public',
    };

    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DATABASE_URL).toBe(validEnv.DATABASE_URL);
      expect(result.data.PORT).toBe(5000);
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.CLIENT_URL).toBe('http://localhost:5173');
      expect(result.data.JWT_ACCESS_EXPIRES_IN).toBe('15m');
      expect(result.data.JWT_REFRESH_EXPIRES_IN).toBe('7d');
      expect(result.data.HEALTH_TOKEN).toBe('dev_health_secret_token_12345');
    }
  });

  it('should parse PORT and SMTP_PORT as numbers', () => {
    const validEnv = {
      DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/cliently_test?schema=public',
      PORT: '8080',
      SMTP_PORT: '2525',
    };

    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(8080);
      expect(typeof result.data.PORT).toBe('number');
      expect(result.data.SMTP_PORT).toBe(2525);
      expect(typeof result.data.SMTP_PORT).toBe('number');
    }
  });
});
