export function buildServerAuthHeaders(
  requestHeaders: Headers,
  configuredOrigin: string,
): Headers {
  const authHeaders = new Headers(requestHeaders)
  if (!authHeaders.has('origin')) authHeaders.set('origin', configuredOrigin)
  return authHeaders
}
