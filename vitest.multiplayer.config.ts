import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  include: ['apps/multiplayer/src/*.integration.ts'], maxWorkers: 1, testTimeout: 90_000, hookTimeout: 60_000,
} });
