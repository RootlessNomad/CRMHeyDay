// Playwright config — E2E sólo se corre si hay un stack arriba (DB+Redis+API).
//
// En local: `pnpm dev` levanta backend+frontend, luego en otra terminal:
//   pnpm --filter @heyday/frontend run e2e
//
// En CI: se activa SÓLO cuando el job define `E2E_FULL_STACK=1`. El job
// principal de PR no lo activa (los UJ E2E llegan en milestones avanzados);
// cuando lo añadamos, el job de E2E levantará docker-compose en GH Actions.

import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const BASE_URL = process.env['E2E_BASE_URL'] ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
