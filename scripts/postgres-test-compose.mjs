import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectName = 'db-control-postgres-test'
const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const composeFile = path.join(repoRoot, 'docker-compose.postgres-test.yml')
const envFile = path.join(repoRoot, '.env.postgres-test')
const healthTimeoutMs = 60_000

const candidates = [
  { command: 'docker', label: 'docker compose', prefix: ['compose'] },
  { command: 'docker-compose', label: 'docker-compose', prefix: [] },
]

function findCompose() {
  for (const candidate of candidates) {
    const probe = spawnSync(candidate.command, [...candidate.prefix, 'version'], {
      cwd: repoRoot,
      stdio: 'ignore',
    })

    if (!probe.error && probe.status === 0) return candidate
  }

  throw new Error('Docker Compose was not found. Install Compose v2 or docker-compose v1.29+.')
}

function composeArgs(candidate, args) {
  return [
    ...candidate.prefix,
    '--project-name',
    projectName,
    '--env-file',
    envFile,
    '--file',
    composeFile,
    ...args,
  ]
}

function runCompose(candidate, args, stdio = 'inherit') {
  const result = spawnSync(candidate.command, composeArgs(candidate, args), {
    cwd: repoRoot,
    stdio,
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${candidate.label} exited with status ${String(result.status)}`)
  }
}

function isReady(candidate) {
  const readinessCommand =
    'pg_isready --host=127.0.0.1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"'
  const result = spawnSync(
    candidate.command,
    composeArgs(candidate, ['exec', '-T', 'postgres-test', 'sh', '-c', readinessCommand]),
    { cwd: repoRoot, stdio: 'ignore' },
  )

  return !result.error && result.status === 0
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitUntilReady(candidate) {
  const deadline = Date.now() + healthTimeoutMs

  while (Date.now() < deadline) {
    if (isReady(candidate)) {
      console.log('[postgres-test] PostgreSQL is healthy.')
      return
    }
    await delay(1_000)
  }

  runCompose(candidate, ['logs', '--tail', '50', 'postgres-test'])
  throw new Error(`PostgreSQL was not ready within ${String(healthTimeoutMs / 1_000)} seconds.`)
}

async function start(candidate) {
  runCompose(candidate, ['up', '--detach', 'postgres-test'])
  await waitUntilReady(candidate)
  runCompose(candidate, ['ps'])
}

async function main() {
  if (!existsSync(envFile)) {
    throw new Error('Missing .env.postgres-test. Copy .env.postgres-test.example first.')
  }

  const action = process.argv[2]
  const candidate = findCompose()
  console.log(`[postgres-test] Using ${candidate.label}.`)

  switch (action) {
    case 'config':
      runCompose(candidate, ['config', '--quiet'])
      console.log('[postgres-test] Compose configuration is valid.')
      break
    case 'down':
      runCompose(candidate, ['down', '--remove-orphans'])
      break
    case 'logs':
      runCompose(candidate, ['logs', '--follow', 'postgres-test'])
      break
    case 'reset':
      runCompose(candidate, ['down', '--volumes', '--remove-orphans'])
      await start(candidate)
      break
    case 'status':
      runCompose(candidate, ['ps'])
      break
    case 'up':
      await start(candidate)
      break
    default:
      throw new Error(
        'Usage: node scripts/postgres-test-compose.mjs <config|up|status|logs|down|reset>',
      )
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[postgres-test] ${message}`)
  process.exitCode = 1
})
