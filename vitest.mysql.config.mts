import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

loadEnv({ path: '.env.mysql-test', quiet: true })
process.env.CONNECTION_ENCRYPTION_KEY ??= '1'.repeat(64)
process.env.DATABASE_HOST_ALLOWLIST ??= process.env.MYSQL_TEST_HOST ?? '127.0.0.1'
process.env.DATABASE_URL ??= 'file:./data/mysql-integration-control-plane.db'
process.env.PAYLOAD_SECRET ??= 'mysql-integration-test-only-secret-32-characters'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    hookTimeout: 45_000,
    include: ['tests/mysql/**/*.mysql.spec.ts'],
    testTimeout: 45_000,
  },
})
