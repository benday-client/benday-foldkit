// SPDX-License-Identifier: GPL-3.0-only
import { defineConfig, devices } from '@playwright/test'

/**
 * The browser gate runs against a freshly built production artifact. The
 * server fixture rebuilds, then refuses to serve when the identity file does
 * not describe the tree under test.
 */
export default defineConfig({
  testDir: 'verification/browser',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  failOnFlakyTests: true,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: '.verification/playwright-report.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // the old-app baseline captures run with an explicit dark scheme; the
    // system-following default would make every landing assertion paint-light
    colorScheme: 'dark',
    trace: 'off',
  },
  webServer: {
    command: 'pnpm exec tsx scripts/serve-dist.ts',
    url: 'http://127.0.0.1:4173/build-identity.json',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
