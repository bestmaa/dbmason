import { lstat, readdir } from 'node:fs/promises'
import path from 'node:path'

const [runtimeInput] = process.argv.slice(2)
if (!runtimeInput) {
  throw new Error('Usage: node scripts/assert-runtime-boundary.mjs <runtime-directory>')
}

const runtimeRoot = path.resolve(runtimeInput)
const forbiddenPatterns = [
  /(?:^|\/)node_modules\/(?:\.pnpm\/)?@img(?:\+|\/)sharp-/u,
  /(?:^|\/)node_modules\/(?:\.pnpm\/)?sharp(?:@|\/|$)/u,
  /(?:^|\/)node_modules\/(?:\.pnpm\/)?stackback(?:@|\/|$)/u,
  /(?:^|\/)node_modules\/(?:\.pnpm\/)?why-is-node-running(?:@|\/|$)/u,
  /(?:^|\/)libvips[^/]*\.so(?:\.|$)/u,
]

function isForbidden(relativePath) {
  const portablePath = relativePath.split(path.sep).join('/')
  return forbiddenPatterns.some((pattern) => pattern.test(portablePath))
}

const violations = []
let entriesVisited = 0

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    const relativePath = path.relative(runtimeRoot, absolutePath)
    entriesVisited += 1
    if (isForbidden(relativePath)) violations.push(relativePath)

    const stats = await lstat(absolutePath)
    if (stats.isDirectory() && !stats.isSymbolicLink()) await walk(absolutePath)
  }
}

await walk(runtimeRoot)
if (entriesVisited === 0) throw new Error(`Runtime directory is empty: ${runtimeRoot}`)
if (violations.length > 0) {
  throw new Error(
    `Forbidden optional/dev runtime artifacts found:\n${violations.slice(0, 50).join('\n')}`,
  )
}

console.log(`[runtime-boundary] Verified ${entriesVisited} runtime entries.`)
