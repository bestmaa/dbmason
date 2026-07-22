import manifest from '../../package.json'

export interface ProductInfo {
  copyrightNotice: string
  licenseName: string
  name: string
  sourceUrl: string
  version: string
  warrantyNotice: string
}

export const productName = 'DBMason'
const officialSourceRoot = 'https://github.com/bestmaa/dbmason'

function safeSourceUrl(value: string | undefined, fallback: string): string {
  if (!value?.trim()) return fallback
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : fallback
  } catch {
    return fallback
  }
}

export function getProductInfo(): ProductInfo {
  const version = manifest.version
  const officialVersionSource = `${officialSourceRoot}/tree/v${encodeURIComponent(version)}`
  return {
    copyrightNotice: '© 2026 Aditya Nandlal',
    licenseName: 'AGPL-3.0-only',
    name: productName,
    sourceUrl: safeSourceUrl(process.env.DBMASON_SOURCE_URL, officialVersionSource),
    version,
    warrantyNotice: 'No warranty',
  }
}
