import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    hookTimeout: 60_000,
    include: ['tests/unit/**/*.spec.ts'],
  },
})
