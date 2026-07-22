import { createHash } from 'node:crypto'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const [reportInput, cargoLockInput, outputInput, libsqlSourceInput, rustDocInput] =
  process.argv.slice(2)
if (!reportInput || !cargoLockInput || !outputInput || !libsqlSourceInput || !rustDocInput) {
  throw new Error(
    'Usage: node scripts/build-libsql-native-notices.mjs <cargo-about.json> <Cargo.lock> <libsql-js@0.4.7-directory> <libsql-source-directory> <rust-1.78-share-doc-rust-directory>',
  )
}

const outputRoot = path.resolve(outputInput)
const libsqlSourceRoot = path.resolve(libsqlSourceInput)
const rustDocRoot = path.resolve(rustDocInput)
if (path.basename(outputRoot) !== 'libsql-js@0.4.7') {
  throw new Error('The output must be the exact libsql-js@0.4.7 supplement directory.')
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value
}

function stringValue(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`)
  }
  return value
}

async function readVerified(root, relativePath, expectedSha256) {
  const bytes = await readFile(path.join(root, relativePath))
  const actualSha256 = hash(bytes)
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `${relativePath} SHA-256 mismatch: expected ${expectedSha256}, received ${actualSha256}.`,
    )
  }
  return bytes
}

function leadingComments(sourceBytes, count, label) {
  const source = sourceBytes.toString('utf8')
  if (!Buffer.from(source, 'utf8').equals(sourceBytes)) {
    throw new Error(`${label} is not valid UTF-8.`)
  }

  let cursor = 0
  for (let index = 0; index < count; index += 1) {
    const whitespace = source.slice(cursor).match(/^\s*/u)?.[0] ?? ''
    cursor += whitespace.length
    if (!source.startsWith('/*', cursor)) {
      throw new Error(`${label} is missing leading comment ${index + 1}.`)
    }
    const end = source.indexOf('*/', cursor + 2)
    if (end < 0) throw new Error(`${label} has an unterminated leading comment.`)
    cursor = end + 2
  }

  const trailingNewline = source.slice(cursor).match(/^\r?\n/u)?.[0] ?? ''
  return Buffer.from(source.slice(0, cursor + trailingNewline.length), 'utf8')
}

const reportBytes = await readFile(path.resolve(reportInput))
const cargoLockBytes = await readFile(path.resolve(cargoLockInput))
const report = record(JSON.parse(reportBytes.toString('utf8')), 'cargo-about report')
if (!Array.isArray(report.crates) || !Array.isArray(report.licenses)) {
  throw new Error('cargo-about report must contain crate and license arrays.')
}

const licenseIdsByComponent = new Map()
const licenseSections = report.licenses.map((rawLicense, licenseIndex) => {
  const license = record(rawLicense, `license ${licenseIndex}`)
  const id = stringValue(license.id, `license ${licenseIndex} id`)
  const name = stringValue(license.name, `license ${licenseIndex} name`)
  const text = stringValue(license.text, `license ${licenseIndex} text`)
    .replaceAll('\r\n', '\n')
    .trim()
  if (!Array.isArray(license.used_by) || license.used_by.length === 0) {
    throw new Error(`License ${id} has no component usage.`)
  }

  const components = license.used_by
    .map((rawUsage, usageIndex) => {
      const usage = record(rawUsage, `${id} usage ${usageIndex}`)
      const crate = record(usage.crate, `${id} usage ${usageIndex} crate`)
      const key = `${stringValue(crate.name, 'crate name')}@${stringValue(crate.version, 'crate version')}`
      const componentLicenseIds = licenseIdsByComponent.get(key) ?? new Set()
      componentLicenseIds.add(id)
      licenseIdsByComponent.set(key, componentLicenseIds)
      return key
    })
    .sort()

  return { components, id, name, text, textSha256: hash(text) }
})

const components = report.crates
  .map((rawCrate, crateIndex) => {
    const crate = record(rawCrate, `crate ${crateIndex}`)
    const packageRecord = record(crate.package, `crate ${crateIndex} package`)
    const name = stringValue(packageRecord.name, `crate ${crateIndex} name`)
    const version = stringValue(packageRecord.version, `crate ${crateIndex} version`)
    const key = `${name}@${version}`
    const licenseIds = [...(licenseIdsByComponent.get(key) ?? [])].sort()
    if (licenseIds.length === 0) throw new Error(`Component ${key} has no detected license text.`)
    const licenseExpression = stringValue(crate.license, `${key} license expression`)
    const source = packageRecord.source
    if (source !== null && typeof source !== 'string') {
      throw new Error(`${key} source must be a string or null.`)
    }
    return { key, licenseExpression, licenseIds, name, source, version }
  })
  .sort((left, right) => left.key.localeCompare(right.key))

const duplicateComponents = components.filter(
  (component, index) => components[index - 1]?.key === component.key,
)
if (duplicateComponents.length > 0) throw new Error('Duplicate components found in cargo-about report.')

const targetTriples = [
  'aarch64-unknown-linux-musl',
  'x86_64-unknown-linux-gnu',
  'x86_64-unknown-linux-musl',
]
const reportSha256 = hash(reportBytes)
const manifest = {
  cargoLockSha256: hash(cargoLockBytes),
  componentCount: components.length,
  components,
  generatedWith: {
    cargoAbout: '0.9.1',
    rust: '1.78.0',
  },
  licenseTextCount: licenseSections.length,
  licenseTexts: licenseSections
    .map(({ components: usedBy, id, name, textSha256 }) => ({ id, name, textSha256, usedBy }))
    .sort((left, right) =>
      `${left.id}:${left.textSha256}`.localeCompare(`${right.id}:${right.textSha256}`),
    ),
  rawReportSha256: reportSha256,
  schemaVersion: 2,
  source: {
    libsqlCommit: '20147731c4a9d6e942b159f183215e9399fda2c3',
    libsqlJsCommit: 'e6422aab8be35af73601e452d40d4a0945fd6bfb',
    libsqlJsVersion: '0.4.7',
  },
  sourceArchives: [
    {
      component: 'webpki-roots@0.26.5',
      licenseExpression: 'MPL-2.0',
      sha256: '0bd24728e5af82c6c4ec1b66ac4844bdf8156257fccda846ec58b42cd0cdbe6a',
      url: 'https://static.crates.io/crates/webpki-roots/webpki-roots-0.26.5.crate',
    },
  ],
  targetTriples,
}

const noticeSections = [...licenseSections]
  .sort((left, right) => `${left.id}:${left.textSha256}`.localeCompare(`${right.id}:${right.textSha256}`))
  .map(
    (license, index) =>
      `\n${'='.repeat(80)}\nLICENSE TEXT ${index + 1}: ${license.name} (${license.id})\nSHA-256: ${license.textSha256}\nUsed by:\n${license.components.map((component) => `- ${component}`).join('\n')}\n${'-'.repeat(80)}\n${license.text}\n`,
  )

const notice = `DBMason libsql-js 0.4.7 native dependency notices

Generated with cargo-about 0.9.1 and Rust 1.78.0 from the exact locked source.
Source commits:
- libsql-js: e6422aab8be35af73601e452d40d4a0945fd6bfb
- libsql: 20147731c4a9d6e942b159f183215e9399fda2c3
Targets: ${targetTriples.join(', ')}
Cargo.lock SHA-256: ${manifest.cargoLockSha256}
Raw cargo-about report SHA-256: ${reportSha256}
Components: ${components.length}
Distinct retained license texts: ${licenseSections.length}

COMPONENTS.json maps every component to its declared expression and retained
license text identifiers. The three target-specific cargo-about reports were
byte-identical; this notice therefore covers local glibc x64 and both official
Alpine container targets.
${noticeSections.join('')}`

await writeFile(path.join(outputRoot, 'COMPONENTS.json'), `${JSON.stringify(manifest, null, 2)}\n`)
await writeFile(path.join(outputRoot, 'NOTICE-RUST-DEPENDENCIES.txt'), notice)
await copyFile(path.resolve(cargoLockInput), path.join(outputRoot, 'SOURCE-Cargo.lock'))

const verbatimSources = [
  {
    expectedSha256: 'cecf589818a56c2da8a0a6cc82c8a215c9770988c033b6016c2b74bf79f38152',
    output: 'LICENSE-LIBSQL-SOURCE-MIT.txt',
    relativePath: 'LICENSE.md',
    root: libsqlSourceRoot,
  },
  {
    expectedSha256: '0c1c9ea80b1b18972618f572eb2d9e99776f39c8303a2533f331d65aa97ef36d',
    output: 'LICENSE-LIBSQL-SQLITE3-MIT.txt',
    relativePath: 'libsql-sqlite3/LICENSE.md',
    root: libsqlSourceRoot,
  },
  {
    expectedSha256: '4cc2340ffda5a4533859b1a8766d0865cf0732e1566236dfa9f3565bea6d75db',
    output: 'LICENSE-SQLITE3MC-MIT.txt',
    relativePath: 'libsql-ffi/bundled/SQLite3MultipleCiphers/LICENSE',
    root: libsqlSourceRoot,
  },
  {
    expectedSha256: 'ad57de27c76254688bd784507a3fd5290edee9ec70a1c68925f72290b4c9b1b7',
    output: 'LICENSE-SQLITE3MC.spdx',
    relativePath: 'libsql-ffi/bundled/SQLite3MultipleCiphers/LICENSE.spdx',
    root: libsqlSourceRoot,
  },
  {
    expectedSha256: '113a3c0eb9c38669ebef8c5821ce437a01e70f09dd313a6be2a58bf816726348',
    output: 'SOURCE-SQLITE3MC-filelist.md',
    relativePath: 'libsql-ffi/bundled/SQLite3MultipleCiphers/src/filelist.md',
    root: libsqlSourceRoot,
  },
  {
    expectedSha256: 'bd0581fef622b3d8b25836cf70feb7e1a7a6171ea9e440b46dfda74c46a0ed0d',
    output: 'NOTICE-RUST-1.78-COPYRIGHT.txt',
    relativePath: 'COPYRIGHT',
    root: rustDocRoot,
  },
  {
    expectedSha256: '23f18e03dc49df91622fe2a76176497404e46ced8a715d9d2b67a7446571cca3',
    output: 'LICENSE-RUST-1.78-MIT.txt',
    relativePath: 'LICENSE-MIT',
    root: rustDocRoot,
  },
  {
    expectedSha256: '62c7a1e35f56406896d7aa7ca52d0cc0d272ac022b5d2796e7d6905db8a3636a',
    output: 'LICENSE-RUST-1.78-APACHE-2.0.txt',
    relativePath: 'LICENSE-APACHE',
    root: rustDocRoot,
  },
]

for (const source of verbatimSources) {
  const bytes = await readVerified(source.root, source.relativePath, source.expectedSha256)
  await writeFile(path.join(outputRoot, source.output), bytes)
}

const immutableRemoteSources = [
  {
    expectedSha256: '996af0513df21f7496288951c41428a03c174e9e4a9d63665c57d670f845ccb1',
    output: 'LICENSE-REFERENCE-LGPL-3.0-or-later.txt',
    url: 'https://raw.githubusercontent.com/spdx/license-list-data/c4a7237ec8f4654e867546f9f409749300f1bf4c/text/LGPL-3.0-or-later.txt',
  },
  {
    expectedSha256: '8147956dd2d78744a052bc0d6490bbefe21e18b325a096fb13b3768b74458b55',
    output: 'LICENSE-REFERENCE-WxWindows-exception-3.1.txt',
    url: 'https://raw.githubusercontent.com/spdx/license-list-data/c4a7237ec8f4654e867546f9f409749300f1bf4c/text/WxWindows-exception-3.1.txt',
  },
]

for (const source of immutableRemoteSources) {
  const response = await fetch(source.url)
  if (!response.ok) throw new Error(`Unable to fetch ${source.url}: HTTP ${response.status}.`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const actualSha256 = hash(bytes)
  if (actualSha256 !== source.expectedSha256) {
    throw new Error(
      `${source.url} SHA-256 mismatch: expected ${source.expectedSha256}, received ${actualSha256}.`,
    )
  }
  await writeFile(path.join(outputRoot, source.output), bytes)
}

const headerSources = [
  {
    comments: 1,
    expectedSha256: 'a74744e19eaae1b26ad9bc963abc042e39de0596d421de9b2459d807a946470a',
    output: 'SOURCE-HEADER-SQLITE-PUBLIC-DOMAIN.txt',
    relativePath: 'libsql-sqlite3/src/main.c',
  },
  {
    comments: 2,
    expectedSha256: '5558e2dee8af013643e05fb8266c068408f9baadb84279e2eca8f06a6985d963',
    output: 'SOURCE-HEADER-SQLITE3MC-rijndael.c.txt',
    relativePath: 'libsql-ffi/bundled/SQLite3MultipleCiphers/src/rijndael.c',
  },
  {
    comments: 2,
    expectedSha256: 'f80640183b62026a1793e796cfb650fb703c2f609fce361a208b8e314621c4f1',
    output: 'SOURCE-HEADER-SQLITE3MC-rijndael.h.txt',
    relativePath: 'libsql-ffi/bundled/SQLite3MultipleCiphers/src/rijndael.h',
  },
  {
    comments: 1,
    expectedSha256: 'e2c26048b6486c07905b2627d34cc9b1a80118f82da39d8fb798f46603df2b9e',
    output: 'SOURCE-HEADER-SQLITE3MC-sha2.c.txt',
    relativePath: 'libsql-ffi/bundled/SQLite3MultipleCiphers/src/sha2.c',
  },
  {
    comments: 2,
    expectedSha256: 'ad386b579c29865ebfa77c299a3798aac37157f41764126e53748c62dd22e689',
    output: 'SOURCE-HEADER-SQLITE3MC-sha1.c.txt',
    relativePath: 'libsql-ffi/bundled/SQLite3MultipleCiphers/src/sha1.c',
  },
  {
    comments: 1,
    expectedSha256: 'ec0f9b5b714655f5c4e36110982fcd018f0409b63ff4f0e98925e468b9553713',
    output: 'SOURCE-HEADER-SQLITE3MC-md5.c.txt',
    relativePath: 'libsql-ffi/bundled/SQLite3MultipleCiphers/src/md5.c',
  },
  {
    comments: 1,
    expectedSha256: '1fc1f9bcecb388dbc41c42895aee16371a6e1da6f541ae481a6255f59d0ddf3d',
    output: 'SOURCE-HEADER-SQLITE3MC-extensionfunctions.c.txt',
    relativePath: 'libsql-ffi/bundled/SQLite3MultipleCiphers/src/extensionfunctions.c',
  },
]

for (const source of headerSources) {
  const bytes = await readVerified(libsqlSourceRoot, source.relativePath, source.expectedSha256)
  await writeFile(
    path.join(outputRoot, source.output),
    leadingComments(bytes, source.comments, source.relativePath),
  )
}

console.log(
  `[libsql-notices] Wrote ${components.length} Cargo components, ${licenseSections.length} Cargo license texts, ${verbatimSources.length} exact source files, ${immutableRemoteSources.length} pinned reference texts, and ${headerSources.length} exact source headers.`,
)
