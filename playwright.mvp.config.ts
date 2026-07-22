import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import path from 'node:path'

loadEnv({ path: path.resolve('.env.postgres-test') })

const e2ePort = process.env.DB_CONTROL_E2E_PORT?.trim() || '39112'
if (!/^\d{4,5}$/u.test(e2ePort) || Number(e2ePort) > 65_535) {
  throw new Error('DB_CONTROL_E2E_PORT must be a valid unprivileged TCP port.')
}
if (e2ePort === '3010' || e2ePort === '3011') {
  throw new Error('Refusing to run E2E on the development or app-test port.')
}
const appURL = `http://127.0.0.1:${e2ePort}`

export default defineConfig({
  expect: { timeout: 60_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir: 'test-results/e2e-mvp',
  reporter: [['list']],
  retries: 0,
  testDir: './tests/e2e-mvp',
  timeout: 180_000,
  use: {
    baseURL: appURL,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  workers: 1,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: {
    command: 'node scripts/start-e2e-app.mjs',
    reuseExistingServer: false,
    timeout: 240_000,
    url: `${appURL}/admin`,
  },
})
