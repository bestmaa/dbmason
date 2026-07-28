import { z } from 'zod'

import { accessLevels, engineIds, sslModes } from '@/modules/database-manager/domain/contracts'
import type {
  AccessLevel,
  ConnectionSummary,
  CreatePrincipalResult,
  EngineId,
  ServerSnapshot,
  SslMode,
} from '@/modules/database-manager/domain/contracts'

import { requestJson } from './managerHttpClient'

interface CreateConnectionRequest {
  engine: EngineId
  host: string
  maintenanceDatabase: string
  name: string
  password: string
  port: number
  sslMode: SslMode
  username: string
}

const connectionSummarySchema = z.object({
  engine: z.enum(engineIds),
  externalHost: z.string().nullable(),
  externalPort: z.number().int().nullable(),
  externalSslMode: z.enum(sslModes).nullable(),
  host: z.string(),
  id: z.string().uuid(),
  lastCheckedAt: z.string().nullable(),
  lastLatencyMs: z.number().nullable(),
  name: z.string(),
  port: z.number().int(),
  serverVersion: z.string().nullable(),
  sslMode: z.enum(sslModes),
  status: z.enum(['offline', 'online', 'unknown']),
})

const capabilitiesSchema = z.object({
  accessLevels: z.array(z.enum(accessLevels)),
  canCreateDatabase: z.boolean(),
  canCreatePrincipal: z.boolean(),
  supportsDatabaseOwners: z.boolean(),
  supportsDefaultPrivileges: z.boolean(),
  supportsObservability: z.boolean(),
  supportsReadOnlyWorkspace: z.boolean(),
  supportsSchemas: z.boolean(),
}).strict()

const principalSummarySchema = z.object({
  authenticationUsername: z.string(),
  canCreateDatabase: z.boolean(),
  canCreateRole: z.boolean(),
  canLogin: z.boolean(),
  isSuperuser: z.boolean(),
  memberships: z.array(z.string()),
  name: z.string(),
  validUntil: z.string().nullable(),
}).strict()

const snapshotBaseShape = {
  capabilities: capabilitiesSchema,
  currentUser: z.string(),
  principals: z.array(principalSummarySchema),
  serverVersion: z.string(),
}

const postgresDatabaseSchema = z.object({
  allowConnections: z.boolean(),
  encoding: z.string(),
  engine: z.literal('postgresql'),
  name: z.string(),
  owner: z.string(),
  publicConnect: z.boolean(),
  publicTemporary: z.boolean(),
  sizeBytes: z.number().nullable(),
}).strict()

const mysqlDatabaseSchema = z.object({
  defaultCharacterSet: z.string(),
  defaultCollation: z.string(),
  engine: z.literal('mysql'),
  name: z.string(),
  sizeBytes: z.number().nullable(),
}).strict()

const snapshotSchema = z.discriminatedUnion('engine', [
  z.object({
    ...snapshotBaseShape,
    databases: z.array(postgresDatabaseSchema),
    engine: z.literal('postgresql'),
  }).strict(),
  z.object({
    ...snapshotBaseShape,
    databases: z.array(mysqlDatabaseSchema),
    engine: z.literal('mysql'),
  }).strict(),
])

const principalResultSchema = z.object({
  oneTimePassword: z.string(),
  principal: z.string(),
  warnings: z.array(z.string()),
})

interface CreateDatabaseRequest {
  name: string
  owner: string | null
}

interface CreatePrincipalRequest {
  access: readonly { database: string; level: AccessLevel }[]
  name: string
}

export const databaseManagerClient = {
  async listConnections(signal?: AbortSignal): Promise<readonly ConnectionSummary[]> {
    const result = await requestJson(
      '/api/db-manager/v1/connections',
      z.object({ connections: z.array(connectionSummarySchema) }),
      { signal: signal ?? null },
    )
    return result.connections
  },

  async createConnection(input: CreateConnectionRequest): Promise<ConnectionSummary> {
    const result = await requestJson(
      '/api/db-manager/v1/connections',
      z.object({ connection: connectionSummarySchema }),
      { body: JSON.stringify(input), method: 'POST' },
    )
    return result.connection
  },

  async updateExternalEndpoint(
    connectionId: string,
    external: { host: string; port: number; sslMode: SslMode } | null,
  ): Promise<ConnectionSummary> {
    const result = await requestJson(
      `/api/db-manager/v1/connections/${connectionId}/endpoint`,
      z.object({ connection: connectionSummarySchema }),
      { body: JSON.stringify({ external }), method: 'PATCH' },
    )
    return result.connection
  },

  getSnapshot(connectionId: string, signal?: AbortSignal): Promise<ServerSnapshot> {
    return requestJson(`/api/db-manager/v1/connections/${connectionId}/snapshot`, snapshotSchema, {
      signal: signal ?? null,
    })
  },

  async testConnection(connectionId: string): Promise<void> {
    await requestJson(
      `/api/db-manager/v1/connections/${connectionId}/test`,
      z.object({ latencyMs: z.number(), serverVersion: z.string() }),
      { method: 'POST' },
    )
  },

  async createDatabase(connectionId: string, input: CreateDatabaseRequest): Promise<void> {
    await requestJson(
      `/api/db-manager/v1/connections/${connectionId}/databases`,
      z.object({ created: z.literal(true) }),
      { body: JSON.stringify(input), method: 'POST' },
    )
  },

  createPrincipal(
    connectionId: string,
    input: CreatePrincipalRequest,
  ): Promise<CreatePrincipalResult> {
    return requestJson(
      `/api/db-manager/v1/connections/${connectionId}/principals`,
      principalResultSchema,
      { body: JSON.stringify(input), method: 'POST' },
    )
  },
}
