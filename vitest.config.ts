// SPDX-License-Identifier: GPL-3.0-only
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/benday/src/**/*.test.ts'],
    environment: 'node',
    clearMocks: true,
    restoreMocks: true,
    allowOnly: false,
    passWithNoTests: false,
    retry: 0,
    reporters: ['default', 'json'],
    outputFile: '.verification/vitest-report.json',
  },
})
