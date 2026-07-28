const maxRedirectLength = 2_048
const unsafeURLCharacter = /[\u0000-\u001f\u007f\\]/u

function decodeAllLayers(value: string): string | undefined {
  let decoded = value

  for (let index = 0; index <= value.length; index += 1) {
    if (!decoded.startsWith('/') || decoded.startsWith('//') || unsafeURLCharacter.test(decoded)) {
      return undefined
    }

    let next: string
    try {
      next = decodeURIComponent(decoded)
    } catch {
      return undefined
    }

    if (next === decoded) return decoded
    decoded = next
  }

  return undefined
}

function normalizeInternalPath(value: unknown, origin: string): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxRedirectLength) {
    return undefined
  }
  if (!decodeAllLayers(value)) return undefined

  try {
    const resolved = new URL(value, origin)
    if (resolved.origin !== origin) return undefined
    const normalizedPath = `${resolved.pathname}${resolved.search}${resolved.hash}`
    if (!decodeAllLayers(normalizedPath)) return undefined

    const normalizedURL = new URL(normalizedPath, origin)
    if (normalizedURL.origin !== origin) return undefined
    return normalizedPath
  } catch {
    return undefined
  }
}

export function getSafeInternalRedirect(
  requestedRedirect: unknown,
  configuredOrigin: string,
  fallback = '/',
): string {
  const origin = new URL(configuredOrigin).origin
  const safeFallback = normalizeInternalPath(fallback, origin) ?? '/'
  return normalizeInternalPath(requestedRedirect, origin) ?? safeFallback
}
