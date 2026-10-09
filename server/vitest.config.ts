import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres_dev_password@localhost:5432/cliently_test?schema=public',
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      HEALTH_TOKEN: 'dev_health_secret_token_12345',
      JWT_ACCESS_SECRET: 'super-secret-access-token-key-cliently-12345',
      JWT_REFRESH_SECRET: 'super-secret-refresh-token-key-cliently-67890',
    },
  },
});
