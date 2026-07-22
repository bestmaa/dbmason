import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { e2eDatabaseURL, prepareE2EControlPlane } from './prepare-e2e.mjs'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const nextBin = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next')
const e2ePort = process.env.DB_CONTROL_E2E_PORT?.trim() || '39112'

if (!/^\d{4,5}$/u.test(e2ePort) || Number(e2ePort) > 65_535) {
  throw new Error('DB_CONTROL_E2E_PORT must be a valid unprivileged TCP port.')
}
if (e2ePort === '3010' || e2ePort === '3011') {
  throw new Error('Refusing to start E2E on the development or app-test port.')
}

await prepareE2EControlPlane()

const child = spawn(
  process.execPath,
  [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', e2ePort],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      CONNECTION_ENCRYPTION_KEY:
        'e2e0000000000000000000000000000000000000000000000000000000000000',
      DATABASE_HOST_ALLOWLIST: '127.0.0.1,localhost',
      DATABASE_URL: e2eDatabaseURL,
      DEV_ALLOWED_ORIGINS: '',
      NEXT_DIST_DIR: '.next-e2e',
      NODE_OPTIONS: '--no-deprecation',
      PAYLOAD_SECRET: 'E2E_only_Payload_secret_never_use_in_production_2026',
      PORT: e2ePort,
    },
    stdio: 'inherit',
  },
)

function forward(signal) {
  if (!child.killed) child.kill(signal)
}

process.once('SIGINT', () => forward('SIGINT'))
process.once('SIGTERM', () => forward('SIGTERM'))

child.once('error', (error) => {
  console.error(`[e2e] Could not start Next.js: ${error.message}`)
  process.exitCode = 1
})

child.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exitCode = code ?? 1
})
