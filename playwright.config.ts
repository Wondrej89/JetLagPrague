import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 960 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (!process.env.CI && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] },
    trace: 'retain-on-failure',
  },
  webServer: [
    { command: 'npm run dev:simulator', url: 'http://127.0.0.1:4177', reuseExistingServer: !process.env.CI, timeout: 120000 },
    { command: 'npm run dev:editor -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
    { command: (process.env.PLAYWRIGHT_SKIP_BUILD ? '' : 'npm run build && ')+'tsx scripts/serve-pages.ts', url: 'http://127.0.0.1:4175/JetLagPrague/', reuseExistingServer: !process.env.CI, timeout: 120000 },
  ],
});
