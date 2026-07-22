import { z } from 'zod'

function readErrorMessage(value: unknown): string {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return 'Request failed.'
  }
  const error = value.error
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return 'Request failed.'
  }
  return typeof error.message === 'string' ? error.message : 'Request failed.'
}

export async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')
  if (init?.body !== undefined) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...init, headers })
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new Error(readErrorMessage(data))
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new Error('The server returned an invalid response.')
  return parsed.data
}
