import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const dataDirectory = path.join(repoRoot, 'data')
const databaseBasename = 'mysql-e2e-control-plane.db'
const allowedArtifacts = new Set([
  databaseBasename,
  `${databaseBasename}-shm`,
  `${databaseBasename}-wal`,
])

export const mysqlE2EDatabaseURL = `file:./data/${databaseBasename}`

function resolveAllowedArtifact(basename) {
  if (!allowedArtifacts.has(basename)) {
    throw new Error(`Refusing to remove an unapproved MySQL E2E artifact: ${basename}`)
  }

  const target = path.resolve(dataDirectory, basename)
  if (path.dirname(target) !== dataDirectory || path.basename(target) !== basename) {
    throw new Error(`Refusing to remove an artifact outside ${dataDirectory}`)
  }

  return target
}
export async function prepareMySQLE2EControlPlane() {
  for (const basename of allowedArtifacts) {
    await rm(resolveAllowedArtifact(basename), { force: true })
  }

  console.log('[mysql-e2e] Prepared the isolated data/mysql-e2e-control-plane.db control plane.')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareMySQLE2EControlPlane().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[mysql-e2e] ${message}`)
    process.exitCode = 1
  })
}
