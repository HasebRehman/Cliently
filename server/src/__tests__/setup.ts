import { beforeAll } from 'vitest';

beforeAll(() => {
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl.includes('_test')) {
    throw new Error(
      `SAFETY VIOLATION: Tests must execute strictly against an isolated database whose name contains '_test' to prevent accidental modifications to development or production databases! Current DATABASE_URL is: ${dbUrl}`
    );
  }
});
