import type { ObservabilitySnapshot } from './observability'
import type {
  BrowseRelationCommand,
  LoadWorkspaceCatalogCommand,
  RunReadOnlyQueryCommand,
  WorkspaceCatalog,
  WorkspaceQueryResult,
} from './workspace'

export const engineIds = ['postgresql'] as const
export type EngineId = (typeof engineIds)[number]

export const sslModes = ['disable', 'prefer', 'require', 'verify-full'] as const
export type SslMode = (typeof sslModes)[number]

export const accessLevels = ['connect', 'read', 'write', 'developer'] as const
export type AccessLevel = (typeof accessLevels)[number]

export type ConnectionStatus = 'offline' | 'online' | 'unknown'

export interface DatabaseConnectionConfig {
  database: string
  host: string
  password: string
  port: number
  sslMode: SslMode
  username: string
}

export interface ConnectionSummary {
  engine: EngineId
  host: string
  id: string
  lastCheckedAt: string | null
  lastLatencyMs: number | null
  name: string
  port: number
  serverVersion: string | null
  status: ConnectionStatus
}

export interface DatabaseSummary {
  allowConnections: boolean
  encoding: string
  name: string
  owner: string
  publicConnect: boolean
  publicTemporary: boolean
  sizeBytes: number | null
}

export interface PrincipalSummary {
  canCreateDatabase: boolean
  canCreateRole: boolean
  canLogin: boolean
  isSuperuser: boolean
  memberships: readonly string[]
  name: string
  validUntil: string | null
}

export interface EngineCapabilities {
  accessLevels: readonly AccessLevel[]
  canCreateDatabase: boolean
  canCreatePrincipal: boolean
  supportsDefaultPrivileges: boolean
  supportsObservability: boolean
  supportsReadOnlyWorkspace: boolean
  supportsSchemas: boolean
}

export interface ServerSnapshot {
  capabilities: EngineCapabilities
  currentUser: string
  databases: readonly DatabaseSummary[]
  engine: EngineId
  principals: readonly PrincipalSummary[]
  serverVersion: string
}

export interface ConnectionTestResult {
  latencyMs: number
  serverVersion: string
}

export interface DatabaseAccessRequest {
  database: string
  level: AccessLevel
}

export interface CreateDatabaseCommand {
  name: string
  owner: string | null
}

export interface CreatePrincipalCommand {
  access: readonly DatabaseAccessRequest[]
  name: string
}

export interface CreatePrincipalResult {
  oneTimePassword: string
  principal: string
  warnings: readonly string[]
}

export interface PrincipalAccessCommand {
  database: string
  level: AccessLevel
  principal: string
}

export interface RevokePrincipalAccessCommand {
  database: string
  principal: string
}

export interface PrincipalAccessResult {
  warnings: readonly string[]
}

export interface SetPrincipalLoginCommand {
  enabled: boolean
  principal: string
}

export interface RotatePrincipalPasswordCommand {
  principal: string
}

export interface RotatePrincipalPasswordResult {
  oneTimePassword: string
  principal: string
}

export interface DropPrincipalCommand {
  principal: string
}

export interface DatabaseEngine {
  readonly id: EngineId
  browseWorkspaceRelation(
    config: DatabaseConnectionConfig,
    command: BrowseRelationCommand,
  ): Promise<WorkspaceQueryResult>
  createDatabase(config: DatabaseConnectionConfig, command: CreateDatabaseCommand): Promise<void>
  createPrincipal(
    config: DatabaseConnectionConfig,
    command: CreatePrincipalCommand,
  ): Promise<CreatePrincipalResult>
  dropPrincipal(config: DatabaseConnectionConfig, command: DropPrincipalCommand): Promise<void>
  getObservability(config: DatabaseConnectionConfig): Promise<ObservabilitySnapshot>
  getSnapshot(config: DatabaseConnectionConfig): Promise<ServerSnapshot>
  loadWorkspaceCatalog(
    config: DatabaseConnectionConfig,
    command: LoadWorkspaceCatalogCommand,
  ): Promise<WorkspaceCatalog>
  revokePrincipalAccess(
    config: DatabaseConnectionConfig,
    command: RevokePrincipalAccessCommand,
  ): Promise<PrincipalAccessResult>
  rotatePrincipalPassword(
    config: DatabaseConnectionConfig,
    command: RotatePrincipalPasswordCommand,
  ): Promise<RotatePrincipalPasswordResult>
  runWorkspaceReadOnlyQuery(
    config: DatabaseConnectionConfig,
    command: RunReadOnlyQueryCommand,
  ): Promise<WorkspaceQueryResult>
  setPrincipalAccess(
    config: DatabaseConnectionConfig,
    command: PrincipalAccessCommand,
  ): Promise<PrincipalAccessResult>
  setPrincipalLogin(
    config: DatabaseConnectionConfig,
    command: SetPrincipalLoginCommand,
  ): Promise<void>
  testConnection(config: DatabaseConnectionConfig): Promise<ConnectionTestResult>
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
  }
}
