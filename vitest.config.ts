import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'scripts/**/*.test.ts'],
  // Full Prague geometries and PID coverage compete for CPU and memory on the
  // shared Actions runner. Keep independent geospatial suites within its budget.
  maxWorkers: process.env.CI ? 2 : undefined,
} });
