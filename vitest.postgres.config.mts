import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

loadEnv({ path: '.env.postgres-test', quiet: true })
process.env.CONNECTION_ENCRYPTION_KEY ??= '0'.repeat(64)
process.env.DATABASE_HOST_ALLOWLIST ??= process.env.POSTGRES_TEST_HOST ?? '127.0.0.1'
process.env.DATABASE_URL ??= 'file:./data/postgres-integration-control-plane.db'
process.env.PAYLOAD_SECRET ??= 'postgres-integration-test-only-secret-32-characters'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    hookTimeout: 30_000,
    include: ['tests/postgres/**/*.postgres.spec.ts'],
    testTimeout: 30_000,
  },
})
