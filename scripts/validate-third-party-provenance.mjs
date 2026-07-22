import { createHash } from 'node:crypto'
import { lstat, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const repositoryRoot = process.cwd()
const legalRoot = path.join(repositoryRoot, 'legal', 'third-party')
const packagesRoot = path.join(legalRoot, 'packages')
const violations = []

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    violations.push(`${label} must be an object.`)
    return {}
  }
  return value
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    violations.push(`${label} must be a non-empty string.`)
    return ''
  }
  return value
}

function validSha256(value, label) {
  const text = nonEmptyString(value, label)
  if (text && !/^[0-9a-f]{64}$/u.test(text)) violations.push(`${label} is not SHA-256.`)
  return text
}

function requireHttps(value, label) {
  const text = nonEmptyString(value, label)
  if (text && !text.startsWith('https://')) violations.push(`${label} must use HTTPS.`)
}

async function readJson(relativePath) {
  const text = await readFile(path.join(repositoryRoot, relativePath), 'utf8')
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${relativePath} is not valid JSON: ${error.message}`)
  }
}

async function collectFiles(directory, relative = '') {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const entryRelative = relative ? `${relative}/${entry.name}` : entry.name
    const entryPath = path.join(directory, entry.name)
    const stats = await lstat(entryPath)
    if (stats.isSymbolicLink()) {
      violations.push(`${entryPath} must not be a symbolic link.`)
    } else if (stats.isDirectory()) {
      files.push(...(await collectFiles(entryPath, entryRelative)))
    } else if (stats.isFile()) {
      files.push(entryRelative)
    } else {
      violations.push(`${entryPath} must be a regular file or directory.`)
    }
  }
  return files.sort()
}

const provenance = record(await readJson('legal/third-party/PROVENANCE.json'), 'PROVENANCE')
const supplements = record(provenance.supplements, 'PROVENANCE.supplements')
const mappings = record(await readJson('legal/third-party/SUPPLEMENTS.json'), 'SUPPLEMENTS')
const exactMappings = record(mappings.exact, 'SUPPLEMENTS.exact')
const prefixMappings = Array.isArray(mappings.prefixes) ? mappings.prefixes : []
if (!Array.isArray(mappings.prefixes)) violations.push('SUPPLEMENTS.prefixes must be an array.')
if (provenance.schemaVersion !== 1) violations.push('PROVENANCE.schemaVersion must equal 1.')

const mappedSupplements = new Set()
for (const [packageKey, directory] of Object.entries(exactMappings)) {
  nonEmptyString(packageKey, 'SUPPLEMENTS exact package key')
  mappedSupplements.add(nonEmptyString(directory, `SUPPLEMENTS.exact.${packageKey}`))
}
for (const [index, rawMapping] of prefixMappings.entries()) {
  const mapping = record(rawMapping, `SUPPLEMENTS.prefixes[${index}]`)
  mappedSupplements.add(nonEmptyString(mapping.directory, `prefix ${index} directory`))
  nonEmptyString(mapping.namePrefix, `prefix ${index} namePrefix`)
  nonEmptyString(mapping.version, `prefix ${index} version`)
}
for (const directory of mappedSupplements) {
  if (directory && !Object.hasOwn(supplements, directory)) {
    violations.push(`SUPPLEMENTS maps to missing provenance directory ${directory}.`)
  }
}

let retainedFileCount = 0
for (const [directory, rawSupplement] of Object.entries(supplements)) {
  if (!mappedSupplements.has(directory)) violations.push(`${directory} has no SUPPLEMENTS mapping.`)
  if (directory.includes('/') || directory.includes('\\') || directory === '.' || directory === '..') {
    violations.push(`${directory} is not a safe supplement directory name.`)
  }

  const supplement = record(rawSupplement, directory)
  if (!Array.isArray(supplement.appliesTo) || supplement.appliesTo.length === 0) {
    violations.push(`${directory}.appliesTo must be a non-empty array.`)
  } else {
    supplement.appliesTo.forEach((value, index) =>
      nonEmptyString(value, `${directory}.appliesTo[${index}]`),
    )
  }

  if (!Array.isArray(supplement.artifacts) || supplement.artifacts.length === 0) {
    violations.push(`${directory}.artifacts must be a non-empty array.`)
  } else {
    for (const [index, rawArtifact] of supplement.artifacts.entries()) {
      const artifact = record(rawArtifact, `${directory}.artifacts[${index}]`)
      nonEmptyString(artifact.name, `${directory} artifact ${index} name`)
      nonEmptyString(artifact.version, `${directory} artifact ${index} version`)
      const integrity = nonEmptyString(artifact.integrity, `${directory} artifact ${index} integrity`)
      if (integrity && !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(integrity)) {
        violations.push(`${directory} artifact ${index} integrity is not SHA-512 SRI.`)
      }
      if (artifact.tarball !== undefined) requireHttps(artifact.tarball, `${directory} tarball`)
      if (artifact.tarballSha256 !== undefined) {
        validSha256(artifact.tarballSha256, `${directory} tarballSha256`)
      }
      if (artifact.binarySha256 !== undefined) {
        validSha256(artifact.binarySha256, `${directory} binarySha256`)
      }
    }
  }

  if (supplement.source !== null) {
    const source = record(supplement.source, `${directory}.source`)
    requireHttps(source.repository, `${directory}.source.repository`)
    if (source.ref !== undefined && !/^[0-9a-f]{40}$/u.test(source.ref)) {
      violations.push(`${directory}.source.ref must be a 40-character Git commit.`)
    }
  }

  const declaredFiles = Array.isArray(supplement.files) ? supplement.files : []
  if (declaredFiles.length === 0) violations.push(`${directory}.files must be a non-empty array.`)
  const declaredPaths = new Set()
  const directoryPath = path.join(packagesRoot, directory)
  for (const [index, rawFile] of declaredFiles.entries()) {
    const file = record(rawFile, `${directory}.files[${index}]`)
    const filePath = nonEmptyString(file.path, `${directory} file ${index} path`)
    const expectedSha256 = validSha256(file.sha256, `${directory}/${filePath} sha256`)
    nonEmptyString(file.derivation, `${directory}/${filePath} derivation`)
    if (
      !filePath ||
      filePath.includes('\\') ||
      path.posix.isAbsolute(filePath) ||
      path.posix.normalize(filePath) !== filePath ||
      filePath.split('/').includes('..')
    ) {
      violations.push(`${directory}/${filePath} is not a safe portable relative path.`)
      continue
    }
    if (declaredPaths.has(filePath)) violations.push(`${directory}/${filePath} is declared twice.`)
    declaredPaths.add(filePath)
    if (file.sourceUrl !== undefined) requireHttps(file.sourceUrl, `${directory}/${filePath} sourceUrl`)
    if (file.referenceUrl !== undefined) {
      requireHttps(file.referenceUrl, `${directory}/${filePath} referenceUrl`)
    }
    if (file.sourceSha256 !== undefined) {
      validSha256(file.sourceSha256, `${directory}/${filePath} sourceSha256`)
      if (file.sourceUrl === undefined) {
        violations.push(`${directory}/${filePath} has sourceSha256 without sourceUrl.`)
      }
    }
    if (file.inputSha256 !== undefined) {
      validSha256(file.inputSha256, `${directory}/${filePath} inputSha256`)
    }
    try {
      const bytes = await readFile(path.join(directoryPath, ...filePath.split('/')))
      const actualSha256 = sha256(bytes)
      if (expectedSha256 && actualSha256 !== expectedSha256) {
        violations.push(
          `${directory}/${filePath} hash mismatch: expected ${expectedSha256}, received ${actualSha256}.`,
        )
      }
      retainedFileCount += 1
    } catch (error) {
      violations.push(`${directory}/${filePath} cannot be read: ${error.message}`)
    }
  }

  const actualFiles = await collectFiles(directoryPath)
  const undeclared = actualFiles.filter((file) => !declaredPaths.has(file))
  const absent = [...declaredPaths].filter((file) => !actualFiles.includes(file))
  if (undeclared.length > 0) violations.push(`${directory} has undeclared files: ${undeclared.join(', ')}`)
  if (absent.length > 0) violations.push(`${directory} declares absent files: ${absent.join(', ')}`)
}

for (const entry of await readdir(packagesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || Object.hasOwn(supplements, entry.name)) continue
  const files = await collectFiles(path.join(packagesRoot, entry.name))
  if (files.length > 0) violations.push(`${entry.name} contains files but has no provenance record.`)
}

const libsql = record(supplements['libsql-js@0.4.7'], 'libsql-js@0.4.7')
const libsqlDirectory = path.join(packagesRoot, 'libsql-js@0.4.7')
const components = record(
  JSON.parse(await readFile(path.join(libsqlDirectory, 'COMPONENTS.json'), 'utf8')),
  'libsql COMPONENTS.json',
)
const componentList = Array.isArray(components.components) ? components.components : []
const licenseTexts = Array.isArray(components.licenseTexts) ? components.licenseTexts : []
if (components.schemaVersion !== 2) violations.push('libsql COMPONENTS schemaVersion must equal 2.')
if (components.componentCount !== componentList.length || componentList.length !== 178) {
  violations.push('libsql component count must be exactly 178 and self-consistent.')
}
if (components.licenseTextCount !== licenseTexts.length || licenseTexts.length !== 66) {
  violations.push('libsql license text count must be exactly 66 and self-consistent.')
}
if (components.cargoLockSha256 !== 'c81ec106dad8512e5eb742a032fb7c4207976b4f8d749ab277bf663908b25869') {
  violations.push('libsql Cargo.lock binding changed.')
}
if (components.rawReportSha256 !== 'f6185a8c8385afdc2d67ca6c453a876f2aca3e289a5f5a701d8f402475c77193') {
  violations.push('libsql cargo-about report binding changed.')
}

const componentKeys = new Set()
for (const [index, rawComponent] of componentList.entries()) {
  const component = record(rawComponent, `libsql component ${index}`)
  const key = nonEmptyString(component.key, `libsql component ${index} key`)
  if (componentKeys.has(key)) violations.push(`Duplicate libsql component ${key}.`)
  componentKeys.add(key)
  if (!Array.isArray(component.licenseIds) || component.licenseIds.length === 0) {
    violations.push(`libsql component ${key} has no license IDs.`)
  }
}
const licensePairs = []
for (const [index, rawLicense] of licenseTexts.entries()) {
  const license = record(rawLicense, `libsql license text ${index}`)
  const id = nonEmptyString(license.id, `libsql license ${index} id`)
  const textSha256 = validSha256(license.textSha256, `libsql license ${index} textSha256`)
  const pair = `${id}:${textSha256}`
  licensePairs.push(pair)
  if (!Array.isArray(license.usedBy) || license.usedBy.length === 0) {
    violations.push(`libsql license text ${pair} has no component usage.`)
  } else {
    for (const key of license.usedBy) {
      if (!componentKeys.has(key)) violations.push(`${pair} references unknown component ${key}.`)
    }
  }
}
for (const rawComponent of componentList) {
  for (const id of rawComponent.licenseIds ?? []) {
    const represented = licenseTexts.some(
      (license) => license.id === id && license.usedBy?.includes(rawComponent.key),
    )
    if (!represented) violations.push(`${rawComponent.key} license ID ${id} has no retained text.`)
  }
}

const notice = await readFile(path.join(libsqlDirectory, 'NOTICE-RUST-DEPENDENCIES.txt'), 'utf8')
const noticePairs = [
  ...notice.matchAll(/^LICENSE TEXT \d+: .* \(([^\r\n]+)\)\r?\nSHA-256: ([0-9a-f]{64})$/gmu),
]
  .map((match) => `${match[1]}:${match[2]}`)
  .sort()
const expectedNoticePairs = [...licensePairs].sort()
if (
  noticePairs.length !== expectedNoticePairs.length ||
  expectedNoticePairs.some((pair, index) => noticePairs[index] !== pair)
) {
  violations.push('NOTICE-RUST-DEPENDENCIES does not match COMPONENTS license texts.')
}

const cargoLock = await readFile(path.join(libsqlDirectory, 'SOURCE-Cargo.lock'), 'utf8')
const webpkiBlock = cargoLock.match(
  /\[\[package\]\]\r?\nname = "webpki-roots"\r?\nversion = "0\.26\.5"[\s\S]*?(?=\r?\n\[\[package\]\]|$)/u,
)?.[0]
const webpkiSha256 = '0bd24728e5af82c6c4ec1b66ac4844bdf8156257fccda846ec58b42cd0cdbe6a'
if (!webpkiBlock?.includes(`checksum = "${webpkiSha256}"`)) {
  violations.push('webpki-roots source checksum is not bound to SOURCE-Cargo.lock.')
}
const sourceArchives = Array.isArray(components.sourceArchives) ? components.sourceArchives : []
const webpkiArchive = sourceArchives.find((archive) => archive.component === 'webpki-roots@0.26.5')
if (
  webpkiArchive?.licenseExpression !== 'MPL-2.0' ||
  webpkiArchive?.sha256 !== webpkiSha256 ||
  webpkiArchive?.url !==
    'https://static.crates.io/crates/webpki-roots/webpki-roots-0.26.5.crate'
) {
  violations.push('webpki-roots MPL source archive metadata is incomplete or changed.')
}

const sourceNative = await readFile(path.join(libsqlDirectory, 'SOURCE-NATIVE.md'), 'utf8')
const filelist = await readFile(path.join(libsqlDirectory, 'SOURCE-SQLITE3MC-filelist.md'), 'utf8')
const rijndaelHeader = await readFile(
  path.join(libsqlDirectory, 'SOURCE-HEADER-SQLITE3MC-rijndael.c.txt'),
  'utf8',
)
const sqlite3mcSpdx = await readFile(path.join(libsqlDirectory, 'LICENSE-SQLITE3MC.spdx'), 'utf8')
const lgplReference = await readFile(
  path.join(libsqlDirectory, 'LICENSE-REFERENCE-LGPL-3.0-or-later.txt'),
  'utf8',
)
const wxReference = await readFile(
  path.join(libsqlDirectory, 'LICENSE-REFERENCE-WxWindows-exception-3.1.txt'),
  'utf8',
)
if (!filelist.includes('LGPL-3.0+ WITH WxWindows-exception-3.1')) {
  violations.push('SQLite3MC filelist no longer preserves the rijndael LGPL metadata.')
}
if (!rijndaelHeader.includes('** License:     MIT') || !rijndaelHeader.includes('public domain')) {
  violations.push('Rijndael exact header no longer preserves its conflicting MIT/public-domain signal.')
}
if (!sqlite3mcSpdx.includes('PackageLicenseDeclared: MIT')) {
  violations.push('SQLite3MC LICENSE.spdx no longer declares the exact project MIT signal.')
}
if (!lgplReference.includes('GNU LESSER GENERAL PUBLIC LICENSE') || !lgplReference.includes('Version 3')) {
  violations.push('The full LGPL-3.0-or-later precautionary reference text is missing.')
}
if (!wxReference.includes('EXCEPTION NOTICE') || !wxReference.includes('version 3.1')) {
  violations.push('The full WxWindows-exception-3.1 precautionary reference text is missing.')
}
for (const marker of ['Rijndael discrepancy', 'metadata conflict is resolved', 'extensionfunctions.c']) {
  if (!sourceNative.includes(marker)) violations.push(`SOURCE-NATIVE is missing conflict marker: ${marker}`)
}

const native = record(libsql.native, 'libsql provenance native metadata')
if (native.cargoAbout?.componentCount !== 178 || native.cargoAbout?.licenseTextCount !== 66) {
  violations.push('libsql provenance Cargo counts do not match the retained manifest.')
}
if (native.webpkiRootsSource?.sha256 !== webpkiSha256) {
  violations.push('libsql provenance does not retain the MPL source checksum.')
}
if (
  native.spdxReferenceTexts?.lgpl3OrLaterSha256 !==
    '996af0513df21f7496288951c41428a03c174e9e4a9d63665c57d670f845ccb1' ||
  native.spdxReferenceTexts?.wxWindowsException31Sha256 !==
    '8147956dd2d78744a052bc0d6490bbefe21e18b325a096fb13b3768b74458b55'
) {
  violations.push('libsql provenance does not retain both precautionary SPDX reference hashes.')
}
const expectedArtifacts = new Map([
  ['@libsql/linux-x64-gnu', ['154261e0f7f1509b24f8504e8e5ddc5c38035096b606c2ed41503a68ac9b00f1', '05fd43b9f701af09d1848891834ca5de15549d8a75aad7160a61a6250e28fd94']],
  ['@libsql/linux-x64-musl', ['76793df7b397491765658a1f7fa7f293fdcfb77bf79bf9a5c3b082d1ce6e08fd', 'aabe37ef0be35ba9f32af85f7d3d68fa1509f421663521fae37fd34bce71ccea']],
  ['@libsql/linux-arm64-gnu', ['3e5edd4003e7684ac839e9669582a4701663e1ebdc464e1f92d4963a3a71813b', 'b3e5f864e6313c8285dfea5c49db658fe20ce841c05d8558038dd19688d0c7a1']],
  ['@libsql/linux-arm64-musl', ['72cdccfc7a56c2b6a37b9f75870ebf7d45974188b46d986b2e5e361a1664a75e', '35b43de6caab0231ef7b5748f068509da3c9994aeb4a611e2ea2b0baca6b6ae6']],
])
const pnpmLock = await readFile(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8')
for (const [name, [tarballSha256, binarySha256]] of expectedArtifacts) {
  const artifact = libsql.artifacts?.find((candidate) => candidate.name === name)
  if (artifact?.tarballSha256 !== tarballSha256 || artifact?.binarySha256 !== binarySha256) {
    violations.push(`${name}@0.4.7 artifact hashes are incomplete or changed.`)
  }
  const lockOffset = pnpmLock.indexOf(`'${name}@0.4.7':`)
  const lockBlock = lockOffset < 0 ? '' : pnpmLock.slice(lockOffset, lockOffset + 500)
  if (!artifact?.integrity || !lockBlock.includes(artifact.integrity)) {
    violations.push(`${name}@0.4.7 provenance integrity does not match pnpm-lock.yaml.`)
  }
}

if (violations.length > 0) {
  throw new Error(`Third-party provenance validation failed:\n- ${violations.join('\n- ')}`)
}

console.log(
  `[third-party-provenance] Verified ${Object.keys(supplements).length} supplements, ${retainedFileCount} retained files, and the 178-component libsql native closure.`,
)
