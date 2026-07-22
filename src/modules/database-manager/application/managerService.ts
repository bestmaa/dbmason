import { randomUUID } from 'node:crypto'

import type { PayloadRequest } from 'payload'

import type {
  ConnectionSummary,
  ConnectionTestResult,
  CreateDatabaseCommand,
  CreatePrincipalCommand,
  CreatePrincipalResult,
  DropPrincipalCommand,
  PrincipalAccessCommand,
  PrincipalAccessResult,
  RevokePrincipalAccessCommand,
  RotatePrincipalPasswordCommand,
  RotatePrincipalPasswordResult,
  ServerSnapshot,
  SetPrincipalLoginCommand,
} from '../domain/contracts'
import { toManagerError } from '../domain/errors'
import type { ObservabilitySnapshot } from '../domain/observability'
import type {
  BrowseRelationCommand,
  LoadWorkspaceCatalogCommand,
  RunReadOnlyQueryCommand,
  WorkspaceCatalog,
  WorkspaceQueryResult,
} from '../domain/workspace'
import { getDatabaseEngine } from '../infrastructure/engines/engineRegistry'
import {
  createConnectionRecord,
  deleteConnectionRecord,
  listConnections,
  loadConnection,
  updateConnectionHealth,
} from '../infrastructure/payload/connectionStore'
import { writeAuditEvent } from '../infrastructure/payload/auditWriter'
import type { CreateConnectionInput } from '../transport/schemas'

interface AuditContext {
  action: string
  connectionId?: number
  target: string
}

async function writeTerminalAudit(
  req: PayloadRequest,
  event: Parameters<typeof writeAuditEvent>[1],
): Promise<void> {
  try {
    await writeAuditEvent(req, event)
  } catch (error) {
    try {
      req.payload.logger.error({
        action: event.action,
        auditErrorType: error instanceof Error ? error.name : typeof error,
        msg: 'DBMason could not persist a terminal audit event.',
        requestId: event.requestId,
      })
    } catch {
      // A logging transport failure must not change an already completed remote operation.
    }
  }
}

export async function withAudit<T>(
  req: PayloadRequest,
  context: AuditContext,
  operation: () => Promise<T>,
): Promise<T> {
  const requestId = randomUUID()
  const startedAt = performance.now()
  await writeAuditEvent(req, { ...context, outcome: 'requested', requestId })

  try {
    const result = await operation()
    await writeTerminalAudit(req, {
      ...context,
      durationMs: Math.round(performance.now() - startedAt),
      outcome: 'succeeded',
      requestId,
    })
    return result
  } catch (error) {
    const managerError = toManagerError(error)
    await writeTerminalAudit(req, {
      ...context,
      durationMs: Math.round(performance.now() - startedAt),
      message: managerError.code,
      outcome: 'failed',
      requestId,
    })
    throw managerError
  }
}

export const managerService = {
  listConnections,

  async createConnection(
    req: PayloadRequest,
    input: CreateConnectionInput,
  ): Promise<ConnectionSummary> {
    return withAudit(req, { action: 'connection.create', target: input.name }, async () => {
      const config = {
        database: input.maintenanceDatabase,
        host: input.host,
        password: input.password,
        port: input.port,
        sslMode: input.sslMode,
        username: input.username,
      }
      const test = await getDatabaseEngine('postgresql').testConnection(config)
      return createConnectionRecord(req, input, test)
    })
  },

  async deleteSavedConnection(req: PayloadRequest, publicId: string): Promise<void> {
    const stored = await loadConnection(req, publicId)
    await withAudit(
      req,
      { action: 'connection.delete.saved', target: stored.document.name },
      // This deletes only the encrypted control-plane record. It never calls a remote engine.
      () => deleteConnectionRecord(req, stored.document),
    )
  },

  async testConnection(req: PayloadRequest, publicId: string): Promise<ConnectionTestResult> {
    const stored = await loadConnection(req, publicId)
    try {
      const result = await getDatabaseEngine(stored.engine).testConnection(stored.config)
      await updateConnectionHealth(req, stored.document, result)
      return result
    } catch (error) {
      await updateConnectionHealth(req, stored.document, null)
      throw toManagerError(error)
    }
  },

  async getSnapshot(req: PayloadRequest, publicId: string): Promise<ServerSnapshot> {
    const stored = await loadConnection(req, publicId)
    return getDatabaseEngine(stored.engine)
      .getSnapshot(stored.config)
      .catch((error: unknown) => {
        throw toManagerError(error)
      })
  },

  async getObservability(req: PayloadRequest, publicId: string): Promise<ObservabilitySnapshot> {
    const stored = await loadConnection(req, publicId)
    return getDatabaseEngine(stored.engine)
      .getObservability(stored.config)
      .catch((error: unknown) => {
        throw toManagerError(error)
      })
  },

  async loadWorkspaceCatalog(
    req: PayloadRequest,
    publicId: string,
    command: LoadWorkspaceCatalogCommand,
  ): Promise<WorkspaceCatalog> {
    const stored = await loadConnection(req, publicId)
    return withAudit(
      req,
      {
        action: 'workspace.catalog.read',
        connectionId: stored.document.id,
        target: `${command.principal}@${command.database}`,
      },
      () => getDatabaseEngine(stored.engine).loadWorkspaceCatalog(stored.config, command),
    )
  },

  async browseWorkspaceRelation(
    req: PayloadRequest,
    publicId: string,
    command: BrowseRelationCommand,
  ): Promise<WorkspaceQueryResult> {
    const stored = await loadConnection(req, publicId)
    return withAudit(
      req,
      {
        action: 'workspace.data.read',
        connectionId: stored.document.id,
        target: `${command.principal}@${command.database}:${command.schema}.${command.relation}`,
      },
      () => getDatabaseEngine(stored.engine).browseWorkspaceRelation(stored.config, command),
    )
  },

  async runWorkspaceReadOnlyQuery(
    req: PayloadRequest,
    publicId: string,
    command: RunReadOnlyQueryCommand,
  ): Promise<WorkspaceQueryResult> {
    const stored = await loadConnection(req, publicId)
    return withAudit(
      req,
      {
        action: 'workspace.query.read',
        connectionId: stored.document.id,
        target: `${command.principal}@${command.database}`,
      },
      () => getDatabaseEngine(stored.engine).runWorkspaceReadOnlyQuery(stored.config, command),
    )
  },

  async createDatabase(
    req: PayloadRequest,
    publicId: string,
    command: CreateDatabaseCommand,
  ): Promise<void> {
    const stored = await loadConnection(req, publicId)
    await withAudit(
      req,
      {
        action: 'database.create',
        connectionId: stored.document.id,
        target: command.name,
      },
      () => getDatabaseEngine(stored.engine).createDatabase(stored.config, command),
    )
  },

  async createPrincipal(
    req: PayloadRequest,
    publicId: string,
    command: CreatePrincipalCommand,
  ): Promise<CreatePrincipalResult> {
    const stored = await loadConnection(req, publicId)
    return withAudit(
      req,
      {
        action: 'principal.create',
        connectionId: stored.document.id,
        target: command.name,
      },
      () => getDatabaseEngine(stored.engine).createPrincipal(stored.config, command),
    )
  },

  async setPrincipalAccess(
    req: PayloadRequest,
    publicId: string,
    command: PrincipalAccessCommand,
  ): Promise<PrincipalAccessResult> {
    const stored = await loadConnection(req, publicId)
    return withAudit(
      req,
      {
        action: 'principal.access.set',
        connectionId: stored.document.id,
        target: `${command.principal}@${command.database}`,
      },
      () => getDatabaseEngine(stored.engine).setPrincipalAccess(stored.config, command),
    )
  },

  async revokePrincipalAccess(
    req: PayloadRequest,
    publicId: string,
    command: RevokePrincipalAccessCommand,
  ): Promise<PrincipalAccessResult> {
    const stored = await loadConnection(req, publicId)
    return withAudit(
      req,
      {
        action: 'principal.access.revoke',
        connectionId: stored.document.id,
        target: `${command.principal}@${command.database}`,
      },
      () => getDatabaseEngine(stored.engine).revokePrincipalAccess(stored.config, command),
    )
  },

  async setPrincipalLogin(
    req: PayloadRequest,
    publicId: string,
    command: SetPrincipalLoginCommand,
  ): Promise<void> {
    const stored = await loadConnection(req, publicId)
    await withAudit(
      req,
      {
        action: command.enabled ? 'principal.login.enable' : 'principal.login.disable',
        connectionId: stored.document.id,
        target: command.principal,
      },
      () => getDatabaseEngine(stored.engine).setPrincipalLogin(stored.config, command),
    )
  },

  async rotatePrincipalPassword(
    req: PayloadRequest,
    publicId: string,
    command: RotatePrincipalPasswordCommand,
  ): Promise<RotatePrincipalPasswordResult> {
    const stored = await loadConnection(req, publicId)
    return withAudit(
      req,
      {
        action: 'principal.password.rotate',
        connectionId: stored.document.id,
        target: command.principal,
      },
      () => getDatabaseEngine(stored.engine).rotatePrincipalPassword(stored.config, command),
    )
  },

  async dropPrincipal(
    req: PayloadRequest,
    publicId: string,
    command: DropPrincipalCommand,
  ): Promise<void> {
    const stored = await loadConnection(req, publicId)
    await withAudit(
      req,
      {
        action: 'principal.drop',
        connectionId: stored.document.id,
        target: command.principal,
      },
      () => getDatabaseEngine(stored.engine).dropPrincipal(stored.config, command),
    )
  },
}
