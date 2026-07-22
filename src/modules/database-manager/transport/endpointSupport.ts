import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import type { AppRole } from '@/access/appRoles'
import { hasAppRole } from '@/access/appRoles'

import type { ApiErrorBody } from '../domain/contracts'
import { ManagerError, toManagerError } from '../domain/errors'

export function requireAuthenticated(req: PayloadRequest): void {
  if (!req.user) throw new ManagerError('UNAUTHENTICATED', 'Sign in is required.', 401)
}

export function requireRole(req: PayloadRequest, roles: readonly AppRole[]): void {
  requireAuthenticated(req)
  if (!hasAppRole(req.user, roles)) {
    throw new ManagerError('FORBIDDEN', 'You do not have permission for this action.', 403)
  }
}

export function getRouteParam(req: PayloadRequest, key: string): string {
  const value = req.routeParams?.[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new ManagerError('INVALID_ROUTE', `Missing route parameter: ${key}.`, 400)
  }
  return value
}

export async function parseJson<T>(req: PayloadRequest, schema: z.ZodType<T>): Promise<T> {
  if (!req.json) throw new ManagerError('INVALID_INPUT', 'A JSON body is required.', 400)
  const body: unknown = await req.json()
  return schema.parse(body)
}

export async function parseBoundedJson<T>(
  req: PayloadRequest,
  schema: z.ZodType<T>,
  maximumBytes: number,
): Promise<T> {
  const declaredLength = Number(req.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new ManagerError('REQUEST_TOO_LARGE', 'The request body is too large.', 413)
  }

  if (!req.body) {
    if (!req.json) throw new ManagerError('INVALID_INPUT', 'A JSON body is required.', 400)
    const fallbackBody: unknown = await req.json()
    if (Buffer.byteLength(JSON.stringify(fallbackBody), 'utf8') > maximumBytes) {
      throw new ManagerError('REQUEST_TOO_LARGE', 'The request body is too large.', 413)
    }
    return schema.parse(fallbackBody)
  }

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let receivedBytes = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    receivedBytes += chunk.value.byteLength
    if (receivedBytes > maximumBytes) {
      await reader.cancel().catch(() => undefined)
      throw new ManagerError('REQUEST_TOO_LARGE', 'The request body is too large.', 413)
    }
    chunks.push(chunk.value)
  }

  const encoded = new Uint8Array(receivedBytes)
  let offset = 0
  for (const chunk of chunks) {
    encoded.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(encoded))
    return schema.parse(body)
  } catch (error) {
    if (error instanceof z.ZodError) throw error
    throw new ManagerError('INVALID_INPUT', 'Enter a valid JSON request body.', 400)
  }
}

export function jsonResponse<T>(data: T, status = 200): Response {
  return Response.json(data, {
    headers: { 'Cache-Control': 'no-store' },
    status,
  })
}

export function endpointError(error: unknown): Response {
  if (error instanceof z.ZodError) {
    const body: ApiErrorBody = {
      error: { code: 'INVALID_INPUT', message: error.issues[0]?.message ?? 'Invalid input.' },
    }
    return jsonResponse(body, 400)
  }

  const safeError = toManagerError(error)
  const body: ApiErrorBody = {
    error: { code: safeError.code, message: safeError.message },
  }
  return jsonResponse(body, safeError.status)
}

export async function handleEndpoint(operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation()
  } catch (error) {
    return endpointError(error)
  }
}
