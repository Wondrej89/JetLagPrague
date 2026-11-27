import { defineConfig } from '@playwright/test';
import existing from './playwright.config';
export default defineConfig({
  ...existing,
  testDir: './tests/multiplayer', testIgnore: [],
  timeout: 180_000,
  webServer: [
    { command: 'tsx scripts/multiplayer-test-server.ts --serve', url:'http://127.0.0.1:4180/status', timeout: 60_000 },
    { command: 'npm run build:game && npm run preview -- --port 4181 --strictPort', url:'http://127.0.0.1:4181/',
      env: { VITE_MULTIPLAYER_URL: 'http://127.0.0.1:4180' }, timeout: 120_000 },
  ],
  use: { ...existing.use, baseURL:'http://127.0.0.1:4181/', viewport:{width:390,height:844} },
});
