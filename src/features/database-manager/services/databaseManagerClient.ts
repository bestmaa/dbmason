import { z } from 'zod'

import { accessLevels } from '@/modules/database-manager/domain/contracts'
import type {
  AccessLevel,
  ConnectionSummary,
  CreatePrincipalResult,
  ServerSnapshot,
  SslMode,
} from '@/modules/database-manager/domain/contracts'

import { requestJson } from './managerHttpClient'

interface CreateConnectionRequest {
  host: string
  maintenanceDatabase: string
  name: string
  password: string
  port: number
  sslMode: SslMode
  username: string
}

const connectionSummarySchema = z.object({
  engine: z.literal('postgresql'),
  host: z.string(),
  id: z.string().uuid(),
  lastCheckedAt: z.string().nullable(),
  lastLatencyMs: z.number().nullable(),
  name: z.string(),
  port: z.number().int(),
  serverVersion: z.string().nullable(),
  status: z.enum(['offline', 'online', 'unknown']),
})

const snapshotSchema = z.object({
  capabilities: z.object({
    accessLevels: z.array(z.enum(accessLevels)),
    canCreateDatabase: z.boolean(),
    canCreatePrincipal: z.boolean(),
    supportsDefaultPrivileges: z.boolean(),
    supportsObservability: z.boolean(),
    supportsReadOnlyWorkspace: z.boolean(),
    supportsSchemas: z.boolean(),
  }),
  currentUser: z.string(),
  databases: z.array(
    z.object({
      allowConnections: z.boolean(),
      encoding: z.string(),
      name: z.string(),
      owner: z.string(),
      publicConnect: z.boolean(),
      publicTemporary: z.boolean(),
      sizeBytes: z.number().nullable(),
    }),
  ),
  engine: z.literal('postgresql'),
  principals: z.array(
    z.object({
      canCreateDatabase: z.boolean(),
      canCreateRole: z.boolean(),
      canLogin: z.boolean(),
      isSuperuser: z.boolean(),
      memberships: z.array(z.string()),
      name: z.string(),
      validUntil: z.string().nullable(),
    }),
  ),
  serverVersion: z.string(),
})

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
