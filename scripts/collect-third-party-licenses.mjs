import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const [nodeModulesInput, outputInput, runtimeNodeModulesInput, productionLicensesInput] =
  process.argv.slice(2)
if (!nodeModulesInput || !outputInput) {
  throw new Error(
    'Usage: node scripts/collect-third-party-licenses.mjs <source-node_modules> <third-party-licenses> [runtime-node_modules] [production-licenses.json]',
  )
}

const nodeModulesRoot = path.resolve(nodeModulesInput)
const runtimeNodeModulesRoot = path.resolve(runtimeNodeModulesInput ?? nodeModulesInput)
const outputRoot = path.resolve(outputInput)
if (
  path.basename(outputRoot) !== 'third-party-licenses' ||
  outputRoot === path.parse(outputRoot).root
) {
  throw new Error('The generated output must be an exact third-party-licenses directory.')
}

const licensePattern = /^(?:licen[cs]es?|copying|notice|copyright)(?:[._-].*)?$/iu
const embeddedLegalPattern =
  /^(?:licen[cs]es?|copying|notice|copyright)(?:[._-].*)?$|\.(?:legal|licen[cs]es?|notice)(?:[._-].*)?$/iu
const packageRecords = new Map()
const legalSource = path.resolve('legal/third-party')
const supplementManifest = JSON.parse(
  await readFile(path.join(legalSource, 'SUPPLEMENTS.json'), 'utf8'),
)

const nextCompiledPolicies = new Map([
  [
    'next@16.2.6',
    {
      expectedLegalFileCount: 137,
      fallbackCoverage: new Map([
        ['@edge-runtime/cookies', ['LICENSE-edge-runtime-MIT.txt']],
        ['@edge-runtime/ponyfill', ['LICENSE-edge-runtime-MIT.txt']],
        ['@edge-runtime/primitives', ['LICENSE-edge-runtime-MIT.txt']],
        ['image-detector', ['dist/compiled/image-size/LICENSE']],
        ['next-server', ['license.md']],
        ['string-hash', ['NOTICE-string-hash-CC0-1.0.txt']],
      ]),
    },
  ],
  [
    'next@16.2.11',
    {
      expectedLegalFileCount: 137,
      fallbackCoverage: new Map([
        ['@edge-runtime/cookies', ['LICENSE-edge-runtime-MIT.txt']],
        ['@edge-runtime/ponyfill', ['LICENSE-edge-runtime-MIT.txt']],
        ['@edge-runtime/primitives', ['LICENSE-edge-runtime-MIT.txt']],
        ['image-detector', ['dist/compiled/image-size/LICENSE']],
        ['next-server', ['license.md']],
        ['string-hash', ['NOTICE-string-hash-CC0-1.0.txt']],
      ]),
    },
  ],
])

function portablePath(filePath) {
  return filePath.split(path.sep).join('/')
}

async function walkFiles(root, relativeDirectory = '') {
  const files = []
  const directory = path.join(root, relativeDirectory)
  const entries = await readdir(directory, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, relativePath)))
    } else if (entry.isFile()) {
      files.push(portablePath(relativePath))
    }
  }
  return files
}

function compiledComponentName(relativePath) {
  const segments = relativePath.split('/')
  if (segments.length < 2) {
    throw new Error(`Unexpected file directly under Next.js dist/compiled: ${relativePath}`)
  }
  if (!segments[0].startsWith('@')) return segments[0]
  if (segments.length < 3) {
    throw new Error(`Unexpected scoped path under Next.js dist/compiled: ${relativePath}`)
  }
  return `${segments[0]}/${segments[1]}`
}

async function sha256(filePath) {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex')
}

async function existingPackageRoots(nodeModulesDirectory) {
  const roots = []
  for (const entry of await readdir(nodeModulesDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidate = path.join(nodeModulesDirectory, entry.name)
    if (!entry.name.startsWith('@')) {
      roots.push(candidate)
      continue
    }
    for (const scopedEntry of await readdir(candidate, { withFileTypes: true })) {
      if (scopedEntry.isDirectory()) roots.push(path.join(candidate, scopedEntry.name))
    }
  }
  return roots
}

function safeDirectoryName(name, version) {
  return `${name
    .replace(/^@/u, '')
    .replaceAll('/', '__')
    .replace(/[^a-zA-Z0-9_.-]/gu, '_')}@${version}`
}

async function nextLegalFileScore(packageRoot) {
  try {
    return (await walkFiles(path.join(packageRoot, 'dist', 'compiled'))).filter((relativePath) =>
      embeddedLegalPattern.test(path.basename(relativePath)),
    ).length
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return -1
    throw error
  }
}

async function readPackages(root, preferCompleteNextArchive = false) {
  const packages = new Map()
  const storeRoot = path.join(root, '.pnpm')
  for (const storeEntry of await readdir(storeRoot, { withFileTypes: true })) {
    if (!storeEntry.isDirectory()) continue
    const packageContainer = path.join(storeRoot, storeEntry.name, 'node_modules')
    let roots
    try {
      roots = await existingPackageRoots(packageContainer)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
      throw error
    }

    for (const packageRoot of roots) {
      let manifest
      try {
        manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
        throw error
      }
      if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') continue
      const key = `${manifest.name}@${manifest.version}`
      const existing = packages.get(key)
      if (!existing) {
        packages.set(key, { manifest, packageRoot })
      } else if (
        preferCompleteNextArchive &&
        manifest.name === 'next' &&
        (await nextLegalFileScore(packageRoot)) > (await nextLegalFileScore(existing.packageRoot))
      ) {
        packages.set(key, { manifest, packageRoot })
      }
    }
  }
  return packages
}

async function readProductionPackageKeys(reportPath) {
  const keys = new Set()
  if (!reportPath) return keys
  const report = JSON.parse(await readFile(path.resolve(reportPath), 'utf8'))
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('The production license report must be an object.')
  }
  const groups = Object.entries(report)
  if (groups.length === 0) throw new Error('The production license report is empty.')
  for (const [licenseGroup, packages] of groups) {
    if (!Array.isArray(packages)) {
      throw new Error(`Production license group ${licenseGroup} must be an array.`)
    }
    for (const packageEntry of packages) {
      if (
        !packageEntry ||
        typeof packageEntry !== 'object' ||
        typeof packageEntry.name !== 'string' ||
        !Array.isArray(packageEntry.versions) ||
        packageEntry.versions.length === 0 ||
        !packageEntry.versions.every((version) => typeof version === 'string')
      ) {
        throw new Error(`Production license group ${licenseGroup} has an invalid package entry.`)
      }
      for (const version of packageEntry.versions) {
        keys.add(`${packageEntry.name}@${version}`)
      }
    }
  }
  if (keys.size === 0) throw new Error('The production license report contains no packages.')
  return keys
}

function supplementDirectory(key, name, version, defaultDirectory) {
  const exact = supplementManifest.exact
  let candidate =
    exact && typeof exact === 'object' && !Array.isArray(exact) ? exact[key] : undefined
  if (candidate === undefined && Array.isArray(supplementManifest.prefixes)) {
    candidate = supplementManifest.prefixes.find(
      (candidate) =>
        candidate &&
        typeof candidate === 'object' &&
        typeof candidate.namePrefix === 'string' &&
        typeof candidate.version === 'string' &&
        name.startsWith(candidate.namePrefix) &&
        version === candidate.version,
    )
  }
  if (candidate === undefined) return defaultDirectory
  const directory = typeof candidate === 'string' ? candidate : candidate?.directory
  if (
    typeof directory !== 'string' ||
    path.basename(directory) !== directory ||
    directory === '.' ||
    directory === '..'
  ) {
    throw new Error(`Invalid supplemental-license directory for ${key}.`)
  }
  return directory
}

async function copySupplementFiles(key, manifest, packageDirectoryName, packageOutput) {
  const directory = supplementDirectory(key, manifest.name, manifest.version, packageDirectoryName)
  const supplementRoot = path.join(legalSource, 'packages', directory)
  const files = []
  let entries
  try {
    entries = await readdir(supplementRoot, { withFileTypes: true })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return files
    throw error
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue
    await copyFile(path.join(supplementRoot, entry.name), path.join(packageOutput, entry.name))
    files.push(entry.name)
  }
  return files.sort()
}

async function collectNextCompiledNotices({
  key,
  licenseFiles,
  packageOutput,
  runtimePackageRoot,
  sourcePackageRoot,
  supplementalFiles,
}) {
  if (!key.startsWith('next@')) return null
  const policy = nextCompiledPolicies.get(key)
  if (!policy) {
    throw new Error(`Next.js ${key} has no reviewed dist/compiled notice policy.`)
  }

  const sourceCompiledRoot = path.join(sourcePackageRoot, 'dist', 'compiled')
  const runtimeCompiledRoot = path.join(runtimePackageRoot, 'dist', 'compiled')
  const embeddedLegalPaths = (await walkFiles(sourceCompiledRoot)).filter((relativePath) =>
    embeddedLegalPattern.test(path.basename(relativePath)),
  )
  if (embeddedLegalPaths.length !== policy.expectedLegalFileCount) {
    throw new Error(
      `${key} supplied ${embeddedLegalPaths.length} dist/compiled legal files; ` +
        `the reviewed policy expects ${policy.expectedLegalFileCount}.`,
    )
  }

  const embeddedLegalFiles = []
  for (const relativePath of embeddedLegalPaths) {
    const sourcePath = path.join(sourceCompiledRoot, relativePath)
    const outputPath = path.join(packageOutput, 'dist', 'compiled', relativePath)
    await mkdir(path.dirname(outputPath), { recursive: true })
    await copyFile(sourcePath, outputPath)
    embeddedLegalFiles.push({
      path: portablePath(path.join('dist', 'compiled', relativePath)),
      sha256: await sha256(sourcePath),
    })
  }

  const runtimeComponents = [
    ...new Set((await walkFiles(runtimeCompiledRoot)).map(compiledComponentName)),
  ].sort()
  if (runtimeComponents.length === 0) {
    throw new Error(`${key} has an empty standalone dist/compiled trace.`)
  }

  const availablePaths = new Set([
    ...licenseFiles,
    ...supplementalFiles,
    ...embeddedLegalFiles.map((file) => file.path),
  ])
  const coverageByComponent = new Map()
  for (const file of embeddedLegalFiles) {
    const relativePath = file.path.slice('dist/compiled/'.length)
    const component = compiledComponentName(relativePath)
    const coverage = coverageByComponent.get(component) ?? []
    coverage.push(file.path)
    coverageByComponent.set(component, coverage)
  }

  const uncoveredComponents = []
  const componentRecords = runtimeComponents.map((component) => {
    const coverage = [
      ...(coverageByComponent.get(component) ?? []),
      ...(policy.fallbackCoverage.get(component) ?? []),
    ]
    const uniqueCoverage = [...new Set(coverage)].sort()
    const missingCoverageFiles = uniqueCoverage.filter((filePath) => !availablePaths.has(filePath))
    if (missingCoverageFiles.length > 0) {
      throw new Error(
        `${key} coverage for ${component} references missing files: ${missingCoverageFiles.join(', ')}`,
      )
    }
    if (uniqueCoverage.length === 0) uncoveredComponents.push(component)
    return { component, coverage: uniqueCoverage }
  })
  if (uncoveredComponents.length > 0) {
    throw new Error(
      `${key} standalone components without legal coverage: ${uncoveredComponents.join(', ')}`,
    )
  }

  const manifestName = 'NEXT_COMPILED_NOTICES.json'
  await writeFile(
    path.join(packageOutput, manifestName),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        sourcePackage: key,
        conservativeLegalFileCount: embeddedLegalFiles.length,
        conservativeLegalFiles: embeddedLegalFiles,
        runtimeComponentCount: componentRecords.length,
        runtimeComponents: componentRecords,
      },
      null,
      2,
    )}\n`,
  )
  return {
    conservativeLegalFileCount: embeddedLegalFiles.length,
    manifest: manifestName,
    runtimeComponentCount: componentRecords.length,
  }
}

// Refuse to overwrite an existing directory. The Docker build stage always
// supplies a fresh target, and this makes local use fail safely.
await mkdir(outputRoot)
await mkdir(path.join(outputRoot, 'packages'), { recursive: true })

const sourcePackages = await readPackages(nodeModulesRoot, true)
const runtimePackages = await readPackages(runtimeNodeModulesRoot)
const includedPackageKeys = new Set(runtimePackages.keys())
for (const key of await readProductionPackageKeys(productionLicensesInput)) {
  includedPackageKeys.add(key)
}
const missingLicenseTexts = []
for (const key of [...includedPackageKeys].sort()) {
  const sourcePackage = sourcePackages.get(key)
  if (!sourcePackage)
    throw new Error(`Included package ${key} is absent from the frozen source install.`)
  const { manifest, packageRoot } = sourcePackage
  const packageDirectoryName = safeDirectoryName(manifest.name, manifest.version)
  const packageOutput = path.join(outputRoot, 'packages', packageDirectoryName)
  await mkdir(packageOutput, { recursive: true })

  const licenseFiles = []
  for (const entry of await readdir(packageRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !licensePattern.test(entry.name)) continue
    await copyFile(path.join(packageRoot, entry.name), path.join(packageOutput, entry.name))
    licenseFiles.push(entry.name)
  }

  const supportingFiles = ['package.json']
  await copyFile(path.join(packageRoot, 'package.json'), path.join(packageOutput, 'package.json'))
  if (manifest.name.startsWith('@img/sharp-libvips-')) {
    for (const fileName of ['README.md', 'versions.json']) {
      await copyFile(path.join(packageRoot, fileName), path.join(packageOutput, fileName))
      supportingFiles.push(fileName)
    }
  }

  const supplementalFiles = await copySupplementFiles(
    key,
    manifest,
    packageDirectoryName,
    packageOutput,
  )
  const runtimePackage = runtimePackages.get(key)
  if (manifest.name === 'next' && !runtimePackage) {
    throw new Error(`${key} is absent from the exact standalone runtime trace.`)
  }
  const compiledNotices = runtimePackage
    ? await collectNextCompiledNotices({
        key,
        licenseFiles,
        packageOutput,
        runtimePackageRoot: runtimePackage.packageRoot,
        sourcePackageRoot: packageRoot,
        supplementalFiles,
      })
    : null
  if (compiledNotices) supportingFiles.push(compiledNotices.manifest)
  if (
    licenseFiles.length === 0 &&
    !supplementalFiles.some((fileName) => licensePattern.test(fileName))
  ) {
    missingLicenseTexts.push(key)
  }
  packageRecords.set(key, {
    author: manifest.author ?? null,
    ...(compiledNotices ? { compiledNotices } : {}),
    license: manifest.license ?? null,
    licenseFiles: licenseFiles.sort(),
    name: manifest.name,
    repository: manifest.repository ?? null,
    supplementalFiles,
    supportingFiles: supportingFiles.sort(),
    version: manifest.version,
  })
}

if (missingLicenseTexts.length > 0) {
  throw new Error(`Runtime packages without a license text: ${missingLicenseTexts.join(', ')}`)
}

const legalOutput = path.join(outputRoot, 'shared')
await mkdir(legalOutput, { recursive: true })
for (const entry of await readdir(legalSource, { withFileTypes: true })) {
  if (entry.isFile())
    await copyFile(path.join(legalSource, entry.name), path.join(legalOutput, entry.name))
}

const records = [...packageRecords.values()].sort((left, right) =>
  `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
)
await writeFile(path.join(outputRoot, 'INDEX.json'), `${JSON.stringify(records, null, 2)}\n`)
await writeFile(
  path.join(outputRoot, 'DEPENDENCY_SCOPE.json'),
  `${JSON.stringify(
    {
      productionGraph: 'non-optional production dependencies from the frozen pnpm graph',
      runtimeTrace: 'all packages present in the generated Next.js standalone runtime',
      nextCompiledNotices:
        'all legal files in the pinned Next.js dist/compiled tree, mapped to every traced runtime component',
    },
    null,
    2,
  )}\n`,
)
await writeFile(
  path.join(outputRoot, 'README.md'),
  `# Third-party license bundle\n\nGenerated from the union of the frozen non-optional production dependency graph and the exact Next.js standalone dependency trace used to build this image. INDEX.json records ${records.length} unique package versions. Package directories contain package metadata, upstream license/notice files, and pinned supplemental notices where a package archive omitted its license text. DEPENDENCY_SCOPE.json records the inventory inputs. Optional packages are included whenever they are present in the standalone runtime. For the pinned Next.js release, NEXT_COMPILED_NOTICES.json records every legal file retained from dist/compiled, its SHA-256 digest, and the notice coverage for each compiled component present in the standalone trace. The OCI SBOM inventories the final filesystem; this notice bundle is not a source-level SBOM of every bundled function.\n`,
)

console.log(`[licenses] Collected notices for ${records.length} unique package versions.`)
