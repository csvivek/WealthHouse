import { defineConfig } from '@playwright/test'

const smokeEnabled = process.env.PLAYWRIGHT_AUTH_READY === '1'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    headless: true,
  },
  webServer: smokeEnabled
    ? {
        command: 'npm run dev -- --port 3000',
        cwd: __dirname,
        url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
})
