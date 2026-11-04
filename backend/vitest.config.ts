import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'pglite:memory',
      JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-1234',
    },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // One in-memory DB per file; files run in isolated workers.
    pool: 'forks',
  },
});
