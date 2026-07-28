import { randomUUID } from 'node:crypto'

import type { PayloadRequest } from 'payload'

import { hasAppRole } from '@/access/appRoles'
import type { DatabaseConnection } from '@/payload-types'

import type {
  ConnectionSummary,
  ConnectionTestResult,
  DatabaseConnectionConfig,
  EngineId,
  SslMode,
} from '../../domain/contracts'
import { ManagerError } from '../../domain/errors'
import type { CreateConnectionInput } from '../../transport/schemas'
import { decryptConnectionSecret, encryptConnectionSecret } from '../security/credentialVault'

export interface StoredConnection {
  config: DatabaseConnectionConfig
  document: DatabaseConnection
  engine: EngineId
}

function canViewExternalEndpoint(req: PayloadRequest): boolean {
  return hasAppRole(req.user, ['owner', 'admin'])
}

function toSummary(
  document: DatabaseConnection,
  includeExternalEndpoint: boolean,
): ConnectionSummary {
  return {
    engine: document.engine,
    externalHost: includeExternalEndpoint ? (document.externalHost ?? null) : null,
    externalPort: includeExternalEndpoint ? (document.externalPort ?? null) : null,
    externalSslMode: includeExternalEndpoint ? (document.externalSslMode ?? null) : null,
    host: document.host,
    id: document.publicId,
    lastCheckedAt: document.lastCheckedAt ?? null,
    lastLatencyMs: document.lastLatencyMs ?? null,
    name: document.name,
    port: document.port,
    serverVersion: document.serverVersion ?? null,
    sslMode: document.sslMode,
    status: document.status,
  }
}

export async function loadConnectionDocument(
  req: PayloadRequest,
  publicId: string,
): Promise<DatabaseConnection> {
  const result = await req.payload.find({
    collection: 'database-connections',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
    where: { publicId: { equals: publicId } },
  })
  const connection = result.docs[0]
  if (!connection) throw new ManagerError('CONNECTION_NOT_FOUND', 'Connection not found.', 404)
  return connection
}

export async function listConnections(req: PayloadRequest): Promise<readonly ConnectionSummary[]> {
  const result = await req.payload.find({
    collection: 'database-connections',
    depth: 0,
    limit: 200,
    overrideAccess: false,
    req,
    sort: 'name',
    user: req.user,
  })
  const includeExternalEndpoint = canViewExternalEndpoint(req)
  return result.docs.map((document) => toSummary(document, includeExternalEndpoint))
}

export async function loadConnection(
  req: PayloadRequest,
  publicId: string,
): Promise<StoredConnection> {
  const document = await loadConnectionDocument(req, publicId)
  return {
    config: decryptConnectionSecret(document.publicId, document.encryptedSecret),
    document,
    engine: document.engine,
  }
}

export async function createConnectionRecord(
  req: PayloadRequest,
  input: CreateConnectionInput,
  test: ConnectionTestResult,
): Promise<ConnectionSummary> {
  if (!req.user) throw new ManagerError('UNAUTHENTICATED', 'Sign in is required.', 401)
  const publicId = randomUUID()
  const secret: DatabaseConnectionConfig = {
    database: input.maintenanceDatabase,
    host: input.host,
    password: input.password,
    port: input.port,
    sslMode: input.sslMode,
    username: input.username,
  }
  const document = await req.payload.create({
    collection: 'database-connections',
    data: {
      createdBy: req.user.id,
      encryptedSecret: encryptConnectionSecret(publicId, secret),
      engine: input.engine,
      host: input.host,
      lastCheckedAt: new Date().toISOString(),
      lastLatencyMs: test.latencyMs,
      maintenanceDatabase: input.maintenanceDatabase,
      name: input.name,
      port: input.port,
      publicId,
      serverVersion: test.serverVersion,
      sslMode: input.sslMode,
      status: 'online',
      username: input.username,
    },
    overrideAccess: true,
    req,
  })
  return toSummary(document, canViewExternalEndpoint(req))
}

export async function updateConnectionHealth(
  req: PayloadRequest,
  document: DatabaseConnection,
  result: ConnectionTestResult | null,
): Promise<ConnectionSummary> {
  const updated = await req.payload.update({
    collection: 'database-connections',
    data: result
      ? {
          lastCheckedAt: new Date().toISOString(),
          lastLatencyMs: result.latencyMs,
          serverVersion: result.serverVersion,
          status: 'online',
        }
      : {
          lastCheckedAt: new Date().toISOString(),
          status: 'offline',
        },
    id: document.id,
    overrideAccess: true,
    req,
  })
  return toSummary(updated, canViewExternalEndpoint(req))
}

export async function deleteConnectionRecord(
  req: PayloadRequest,
  document: DatabaseConnection,
): Promise<void> {
  await req.payload.delete({
    collection: 'database-connections',
    id: document.id,
    overrideAccess: true,
    req,
  })
}

export async function updateConnectionExternalEndpoint(
  req: PayloadRequest,
  document: DatabaseConnection,
  external: { host: string; port: number; sslMode: SslMode } | null,
): Promise<ConnectionSummary> {
  const updated = await req.payload.update({
    collection: 'database-connections',
    data: external
      ? {
          externalHost: external.host,
          externalPort: external.port,
          externalSslMode: external.sslMode,
        }
      : {
          externalHost: null,
          externalPort: null,
          externalSslMode: null,
        },
    id: document.id,
    overrideAccess: true,
    req,
  })
  return toSummary(updated, true)
}
