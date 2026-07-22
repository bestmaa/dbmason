import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectName = 'dbmason-mysql-test'
const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const composeFile = path.join(repoRoot, 'docker-compose.mysql-test.yml')
const envFile = path.join(repoRoot, '.env.mysql-test')
const healthTimeoutMs = 90_000

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
    'mysqladmin ping --protocol=TCP --host=127.0.0.1 --user=root --password="$MYSQL_ROOT_PASSWORD" --silent'
  const result = spawnSync(
    candidate.command,
    composeArgs(candidate, ['exec', '-T', 'mysql-test', 'sh', '-c', readinessCommand]),
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
      console.log('[mysql-test] MySQL is healthy.')
      return
    }
    await delay(1_000)
  }

  runCompose(candidate, ['logs', '--tail', '80', 'mysql-test'])
  throw new Error(`MySQL was not ready within ${String(healthTimeoutMs / 1_000)} seconds.`)
}

async function start(candidate) {
  runCompose(candidate, ['up', '--detach', 'mysql-test'])
  await waitUntilReady(candidate)
  runCompose(candidate, ['ps'])
}

async function main() {
  if (!existsSync(envFile)) {
    throw new Error('Missing .env.mysql-test. Copy .env.mysql-test.example first.')
  }

  const action = process.argv[2]
  const candidate = findCompose()
  console.log(`[mysql-test] Using ${candidate.label}.`)

  switch (action) {
    case 'config':
      runCompose(candidate, ['config', '--quiet'])
      console.log('[mysql-test] Compose configuration is valid.')
      break
    case 'down':
      runCompose(candidate, ['down', '--remove-orphans'])
      break
    case 'logs':
      runCompose(candidate, ['logs', '--follow', 'mysql-test'])
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
        'Usage: node scripts/mysql-test-compose.mjs <config|up|status|logs|down|reset>',
      )
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[mysql-test] ${message}`)
  process.exitCode = 1
})
