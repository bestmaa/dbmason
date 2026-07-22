import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const roots = ['src/app/(frontend)', 'src/features', 'src/styles', 'src/ui']
const extensions = new Set(['.css', '.scss', '.ts', '.tsx'])
const maxLines = 250

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name)
      return entry.isDirectory() ? collectFiles(entryPath) : [entryPath]
    }),
  )

  return nested.flat()
}

const files = (await Promise.all(roots.map(collectFiles)))
  .flat()
  .filter((file) => extensions.has(path.extname(file)))

const violations = []
for (const file of files) {
  const source = await readFile(file, 'utf8')
  const lines = source === '' ? 0 : source.split(/\r?\n/u).length
  if (lines > maxLines) violations.push(`${file}: ${lines} lines`)
}

if (violations.length > 0) {
  console.error(`Frontend files must stay at or below ${maxLines} lines:\n${violations.join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`Checked ${files.length} frontend files: all are <= ${maxLines} lines.`)
}
