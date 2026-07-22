import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  mysqlE2EDatabaseURL,
  prepareMySQLE2EControlPlane,
} from './prepare-mysql-e2e.mjs'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const nextBin = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next')
const e2ePort = process.env.DBMASON_MYSQL_E2E_PORT?.trim() || '39116'

if (!/^\d{4,5}$/u.test(e2ePort) || Number(e2ePort) > 65_535) {
  throw new Error('DBMASON_MYSQL_E2E_PORT must be a valid unprivileged TCP port.')
}
if (['3010', '3011', '39112'].includes(e2ePort)) {
  throw new Error('Refusing to start MySQL E2E on a development or PostgreSQL E2E port.')
}

await prepareMySQLE2EControlPlane()

const child = spawn(
  process.execPath,
  [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', e2ePort],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      CONNECTION_ENCRYPTION_KEY: 'a1'.repeat(32),
      DATABASE_HOST_ALLOWLIST: '127.0.0.1,localhost',
      DATABASE_URL: mysqlE2EDatabaseURL,
      DBMASON_PUBLIC_URL: `http://127.0.0.1:${e2ePort}`,
      DEV_ALLOWED_ORIGINS: '',
      NEXT_DIST_DIR: '.next-e2e-mysql',
      NODE_OPTIONS: '--no-deprecation',
      PAYLOAD_SECRET: 'MySQL_E2E_only_Payload_secret_never_use_in_production_2026',
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
  console.error(`[mysql-e2e] Could not start Next.js: ${error.message}`)
  process.exitCode = 1
})

child.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exitCode = code ?? 1
})
