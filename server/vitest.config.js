import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.js'],
    // All integration test files share one test database, so run them serially.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
    env: { NODE_ENV: 'test' },
  },
});
