import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import path from 'node:path'

loadEnv({ path: path.resolve('.env.mysql-test') })

const e2ePort = process.env.DBMASON_MYSQL_E2E_PORT?.trim() || '39116'
if (!/^\d{4,5}$/u.test(e2ePort) || Number(e2ePort) > 65_535) {
  throw new Error('DBMASON_MYSQL_E2E_PORT must be a valid unprivileged TCP port.')
}
if (['3010', '3011', '39112'].includes(e2ePort)) {
  throw new Error('Refusing to run MySQL E2E on a development or PostgreSQL E2E port.')
}
const appURL = `http://127.0.0.1:${e2ePort}`

export default defineConfig({
  expect: { timeout: 60_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir: 'test-results/e2e-mysql',
  reporter: [['list']],
  retries: 0,
  testDir: './tests/e2e-mysql',
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
    command: 'node scripts/start-mysql-e2e-app.mjs',
    reuseExistingServer: false,
    timeout: 240_000,
    url: `${appURL}/admin`,
  },
})
