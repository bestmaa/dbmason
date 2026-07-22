import type { QueryResultRow } from 'pg'

import type {
  AccessLevel,
  ConnectionTestResult,
  CreateDatabaseCommand,
  CreatePrincipalCommand,
  CreatePrincipalResult,
  DatabaseConnectionConfig,
  DatabaseEngine,
  PostgresDatabaseSummary,
  DropPrincipalCommand,
  PrincipalAccessCommand,
  PrincipalAccessResult,
  PrincipalSummary,
  RevokePrincipalAccessCommand,
  RotatePrincipalPasswordCommand,
  RotatePrincipalPasswordResult,
  ServerSnapshot,
  SetPrincipalLoginCommand,
} from '../../domain/contracts'
import { ManagerError } from '../../domain/errors'
import type { PostgresObservabilitySnapshot } from '../../domain/observability'
import type {
  BrowseRelationCommand,
  LoadWorkspaceCatalogCommand,
  RunReadOnlyQueryCommand,
  WorkspaceCatalog,
  WorkspaceQueryResult,
} from '../../domain/workspace'
import { generateDatabasePassword } from '../security/passwordGenerator'
import { createScramSha256Verifier } from '../security/scramSha256Verifier'
import { quoteIdentifier } from './identifiers'
import { getPostgresObservability } from './PostgresObservability'
import {
  browseWorkspaceRelation,
  loadWorkspaceCatalog,
  runWorkspaceReadOnlyQuery,
} from './PostgresWorkspace'
import { withPostgresClient } from './postgresClient'

interface ServerRow extends QueryResultRow {
  currentUser: string
  serverVersion: string
}

interface DatabaseRow extends QueryResultRow {
  allowConnections: boolean
  encoding: string
  name: string
  owner: string
  publicConnect: boolean
  publicTemporary: boolean
  sizeBytes: string | null
}

interface PrincipalRow extends QueryResultRow {
  canCreateDatabase: boolean
  canCreateRole: boolean
  canLogin: boolean
  isSuperuser: boolean
  memberships: string[]
  name: string
  validUntil: string | null
}

interface OwnerRow extends QueryResultRow {
  owner: string
}

interface AccessTargetRow extends QueryResultRow {
  allowConnections: boolean
  name: string
}

interface SchemaRow extends QueryResultRow {
  hasPublicSchema: boolean
}

interface ManagedPrincipalRow extends QueryResultRow {
  canCreateDatabase: boolean
  canCreateRole: boolean
  canLogin: boolean
  canReplicate: boolean
  bypassesRowSecurity: boolean
  hasPassword: boolean
  hasUnsafeMembership: boolean
  isCurrentUser: boolean
  isSuperuser: boolean
}

interface DefaultOwnerRow extends QueryResultRow {
  canAlter: boolean
  owner: string
}

interface EffectiveAccessRow extends QueryResultRow {
  effectiveConnect: boolean
  publicConnect: boolean
}

const capabilities = {
  accessLevels: ['connect', 'read', 'write', 'developer'],
  canCreateDatabase: true,
  canCreatePrincipal: true,
  supportsDatabaseOwners: true,
  supportsDefaultPrivileges: true,
  supportsObservability: true,
  supportsReadOnlyWorkspace: true,
  supportsSchemas: true,
} as const

function verifierLiteral(verifier: string): string {
  const base64 = '[A-Za-z\\d+/]+={0,2}'
  const pattern = new RegExp(`^SCRAM-SHA-256\\$\\d+:${base64}\\$${base64}:${base64}$`, 'u')
  if (!pattern.test(verifier)) throw new Error('Generated SCRAM verifier is not SQL safe')
  return `'${verifier}'`
}

function accessStatements(level: AccessLevel, role: string): readonly string[] {
  const grantee = quoteIdentifier(role)
  if (level === 'connect') return []

  const schemaGrant =
    level === 'developer'
      ? `GRANT USAGE, CREATE ON SCHEMA public TO ${grantee}`
      : `GRANT USAGE ON SCHEMA public TO ${grantee}`
  if (level === 'read') {
    return [
      schemaGrant,
      `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${grantee}`,
      `GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ${grantee}`,
    ]
  }
  if (level === 'write') {
    return [
      schemaGrant,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${grantee}`,
      `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${grantee}`,
    ]
  }
  return [
    schemaGrant,
    `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${grantee}`,
    `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${grantee}`,
  ]
}

function defaultPrivilegeStatements(level: AccessLevel, owner: string, role: string): string[] {
  if (level === 'connect') return []
  const prefix = `ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdentifier(owner)} IN SCHEMA public`
  const grantee = quoteIdentifier(role)
  if (level === 'read') {
    return [
      `${prefix} GRANT SELECT ON TABLES TO ${grantee}`,
      `${prefix} GRANT SELECT ON SEQUENCES TO ${grantee}`,
    ]
  }
  if (level === 'write') {
    return [
      `${prefix} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${grantee}`,
      `${prefix} GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${grantee}`,
    ]
  }
  return [
    `${prefix} GRANT ALL PRIVILEGES ON TABLES TO ${grantee}`,
    `${prefix} GRANT ALL PRIVILEGES ON SEQUENCES TO ${grantee}`,
  ]
}

function defaultPrivilegeRevokeStatements(owner: string, role: string): readonly string[] {
  const prefix = `ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdentifier(owner)} IN SCHEMA public`
  const grantee = quoteIdentifier(role)
  return [
    `${prefix} REVOKE ALL PRIVILEGES ON TABLES FROM ${grantee}`,
    `${prefix} REVOKE ALL PRIVILEGES ON SEQUENCES FROM ${grantee}`,
  ]
}

function targetPrivilegeRevokeStatements(role: string): readonly string[] {
  const grantee = quoteIdentifier(role)
  return [
    `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${grantee}`,
    `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${grantee}`,
    `REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${grantee}`,
  ]
}

export class PostgresEngine implements DatabaseEngine {
  readonly id = 'postgresql' as const

  browseWorkspaceRelation(
    config: DatabaseConnectionConfig,
    command: BrowseRelationCommand,
  ): Promise<WorkspaceQueryResult> {
    return browseWorkspaceRelation(config, command)
  }

  getObservability(config: DatabaseConnectionConfig): Promise<PostgresObservabilitySnapshot> {
    return getPostgresObservability(config)
  }

  loadWorkspaceCatalog(
    config: DatabaseConnectionConfig,
    command: LoadWorkspaceCatalogCommand,
  ): Promise<WorkspaceCatalog> {
    return loadWorkspaceCatalog(config, command)
  }

  runWorkspaceReadOnlyQuery(
    config: DatabaseConnectionConfig,
    command: RunReadOnlyQueryCommand,
  ): Promise<WorkspaceQueryResult> {
    return runWorkspaceReadOnlyQuery(config, command)
  }

  async testConnection(config: DatabaseConnectionConfig): Promise<ConnectionTestResult> {
    const startedAt = performance.now()
    const serverVersion = await withPostgresClient(config, config.database, async (client) => {
      const result = await client.query<{ serverVersion: string }>(
        'SELECT current_setting(\'server_version\') AS "serverVersion"',
      )
      return result.rows[0]?.serverVersion ?? 'Unknown'
    })
    return { latencyMs: Math.round(performance.now() - startedAt), serverVersion }
  }

  async getSnapshot(config: DatabaseConnectionConfig): Promise<ServerSnapshot> {
    return withPostgresClient(config, config.database, async (client) => {
      const server = await client.query<ServerRow>(
        'SELECT current_user AS "currentUser", current_setting(\'server_version\') AS "serverVersion"',
      )
      const databases = await client.query<DatabaseRow>(`
        SELECT datname AS name,
          pg_get_userbyid(datdba) AS owner,
          pg_encoding_to_char(encoding) AS encoding,
          datallowconn AS "allowConnections",
          has_database_privilege('public', datname, 'CONNECT') AS "publicConnect",
          has_database_privilege('public', datname, 'TEMPORARY') AS "publicTemporary",
          pg_database_size(pg_database.oid)::text AS "sizeBytes"
        FROM pg_database
        WHERE NOT datistemplate
        ORDER BY datname
      `)
      const principals = await client.query<PrincipalRow>(`
        SELECT role.rolname AS name,
          role.rolcanlogin AS "canLogin",
          role.rolsuper AS "isSuperuser",
          role.rolcreatedb AS "canCreateDatabase",
          role.rolcreaterole AS "canCreateRole",
          role.rolvaliduntil::text AS "validUntil",
          ARRAY(
            SELECT parent.rolname::text
            FROM pg_auth_members membership
            JOIN pg_roles parent ON parent.oid = membership.roleid
            WHERE membership.member = role.oid
            ORDER BY parent.rolname
          )::text[] AS memberships
        FROM pg_roles role
        WHERE role.rolname !~ '^pg_'
        ORDER BY role.rolname
      `)
      const serverRow = server.rows[0]
      if (!serverRow) throw new Error('PostgreSQL returned no server information')

      return {
        capabilities,
        currentUser: serverRow.currentUser,
        databases: databases.rows.map((row): PostgresDatabaseSummary => ({
          ...row,
          engine: this.id,
          sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
        })),
        engine: this.id,
        principals: principals.rows.map((row): PrincipalSummary => row),
        serverVersion: serverRow.serverVersion,
      }
    })
  }

  async createDatabase(
    config: DatabaseConnectionConfig,
    command: CreateDatabaseCommand,
  ): Promise<void> {
    const owner = command.owner ? ` OWNER ${quoteIdentifier(command.owner)}` : ''
    const statement = `CREATE DATABASE ${quoteIdentifier(command.name)}${owner}`
    await withPostgresClient(config, config.database, async (client) => {
      await client.query(statement)
    })
  }

  async createPrincipal(
    config: DatabaseConnectionConfig,
    command: CreatePrincipalCommand,
  ): Promise<CreatePrincipalResult> {
    await this.assertAccessTargets(config, command)
    const password = generateDatabasePassword()
    const verifier = createScramSha256Verifier(password)
    const principal = quoteIdentifier(command.name)
    await withPostgresClient(config, config.database, async (client) => {
      await client.query(`CREATE ROLE ${principal} LOGIN PASSWORD ${verifierLiteral(verifier)}`)
    })

    const warnings: string[] = []
    try {
      for (const requestedAccess of command.access) {
        await this.applyAccess(
          config,
          command.name,
          requestedAccess.database,
          requestedAccess.level,
          warnings,
        )
      }
    } catch (error) {
      await this.compensatePrincipalCreation(config, command)
      throw error
    }

    return { oneTimePassword: password, principal: command.name, warnings }
  }

  async setPrincipalAccess(
    config: DatabaseConnectionConfig,
    command: PrincipalAccessCommand,
  ): Promise<PrincipalAccessResult> {
    await this.assertManageablePrincipal(config, command.principal)
    await this.assertAccessTargets(config, {
      access: [{ database: command.database, level: command.level }],
      name: command.principal,
    })
    await this.clearAccess(config, command.principal, command.database)

    const warnings: string[] = []
    try {
      await this.applyAccess(config, command.principal, command.database, command.level, warnings)
    } catch (error) {
      await this.clearAccess(config, command.principal, command.database).catch(() => undefined)
      throw error
    }
    return { warnings }
  }

  async revokePrincipalAccess(
    config: DatabaseConnectionConfig,
    command: RevokePrincipalAccessCommand,
  ): Promise<PrincipalAccessResult> {
    await this.assertManageablePrincipal(config, command.principal)
    await this.assertDatabaseExists(config, command.database)
    await this.clearAccess(config, command.principal, command.database)

    const access = await withPostgresClient(config, config.database, async (client) => {
      const result = await client.query<EffectiveAccessRow>(
        `SELECT has_database_privilege('public', $1, 'CONNECT') AS "publicConnect",
          has_database_privilege($2, $1, 'CONNECT') AS "effectiveConnect"`,
        [command.database, command.principal],
      )
      return result.rows[0]
    })
    const warnings: string[] = []
    if (access?.publicConnect) {
      warnings.push(
        `Direct access was revoked, but PUBLIC still grants CONNECT to ${command.database}.`,
      )
    } else if (access?.effectiveConnect) {
      warnings.push(
        `Direct access was revoked, but role membership still grants CONNECT to ${command.database}.`,
      )
    }
    return { warnings }
  }

  async setPrincipalLogin(
    config: DatabaseConnectionConfig,
    command: SetPrincipalLoginCommand,
  ): Promise<void> {
    await this.assertManageablePrincipal(config, command.principal)
    const attribute = command.enabled ? 'LOGIN' : 'NOLOGIN'
    await withPostgresClient(config, config.database, async (client) => {
      await client.query(`ALTER ROLE ${quoteIdentifier(command.principal)} ${attribute}`)
    })
  }

  async rotatePrincipalPassword(
    config: DatabaseConnectionConfig,
    command: RotatePrincipalPasswordCommand,
  ): Promise<RotatePrincipalPasswordResult> {
    await this.assertManageablePrincipal(config, command.principal)
    const password = generateDatabasePassword()
    const verifier = createScramSha256Verifier(password)
    await withPostgresClient(config, config.database, async (client) => {
      await client.query(
        `ALTER ROLE ${quoteIdentifier(command.principal)} PASSWORD ${verifierLiteral(verifier)}`,
      )
    })
    return { oneTimePassword: password, principal: command.principal }
  }

  async dropPrincipal(
    config: DatabaseConnectionConfig,
    command: DropPrincipalCommand,
  ): Promise<void> {
    await this.assertManageablePrincipal(config, command.principal)
    await withPostgresClient(config, config.database, async (client) => {
      await client.query(`DROP ROLE ${quoteIdentifier(command.principal)}`)
    })
  }

  private async assertManageablePrincipal(
    config: DatabaseConnectionConfig,
    principal: string,
  ): Promise<void> {
    const role = await withPostgresClient(config, config.database, async (client) => {
      const result = await client.query<ManagedPrincipalRow>(
        `WITH RECURSIVE target AS (
          SELECT * FROM pg_roles WHERE rolname = $1
        ), effective(roleid) AS (
          SELECT oid FROM target
          UNION
          SELECT membership.roleid
          FROM pg_auth_members membership
          JOIN effective child ON child.roleid = membership.member
        )
        SELECT role.rolcanlogin AS "canLogin",
          role.rolsuper AS "isSuperuser",
          role.rolcreatedb AS "canCreateDatabase",
          role.rolcreaterole AS "canCreateRole",
          role.rolreplication AS "canReplicate",
          role.rolbypassrls AS "bypassesRowSecurity",
          role.rolpassword IS NOT NULL AS "hasPassword",
          role.rolname = current_user AS "isCurrentUser",
          EXISTS (
            SELECT 1
            FROM effective
            JOIN pg_roles parent ON parent.oid = effective.roleid
            WHERE parent.rolname = current_user
              OR parent.rolsuper
              OR parent.rolcreatedb
              OR parent.rolcreaterole
              OR parent.rolreplication
              OR parent.rolbypassrls
              OR left(parent.rolname, 3) = 'pg_'
          ) AS "hasUnsafeMembership"
        FROM target role`,
        [principal],
      )
      return result.rows[0]
    })
    if (!role) {
      throw new ManagerError('PRINCIPAL_NOT_FOUND', 'The PostgreSQL role does not exist.', 404)
    }
    if (
      role.isCurrentUser ||
      role.isSuperuser ||
      role.canCreateDatabase ||
      role.canCreateRole ||
      role.canReplicate ||
      role.bypassesRowSecurity ||
      role.hasUnsafeMembership
    ) {
      throw new ManagerError(
        'PROTECTED_PRINCIPAL',
        'Privileged roles and the active connection role cannot be managed.',
        409,
      )
    }
    if (!role.canLogin && !role.hasPassword) {
      throw new ManagerError(
        'PRINCIPAL_NOT_MANAGEABLE',
        'Only standard login roles can be managed.',
        409,
      )
    }
  }

  private async assertDatabaseExists(
    config: DatabaseConnectionConfig,
    database: string,
  ): Promise<void> {
    const exists = await withPostgresClient(config, config.database, async (client) => {
      const result = await client.query<{ exists: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
        [database],
      )
      return result.rows[0]?.exists ?? false
    })
    if (!exists) throw new ManagerError('DATABASE_NOT_FOUND', 'The database does not exist.', 404)
  }

  private async compensatePrincipalCreation(
    config: DatabaseConnectionConfig,
    command: CreatePrincipalCommand,
  ): Promise<void> {
    const databases = [...new Set(command.access.map(({ database }) => database))].reverse()
    for (const database of databases) {
      await this.clearAccess(config, command.name, database).catch(() => undefined)
    }
    await withPostgresClient(config, config.database, async (client) => {
      await client.query(`DROP ROLE ${quoteIdentifier(command.name)}`)
    }).catch(() => undefined)
  }

  private async clearAccess(
    config: DatabaseConnectionConfig,
    role: string,
    database: string,
  ): Promise<void> {
    const target = await this.loadTargetPrivilegeContext(config, role, database)
    if (target.hasPublicSchema) {
      await withPostgresClient(config, database, async (client) => {
        await client.query('BEGIN')
        try {
          for (const owner of target.defaultOwners) {
            for (const statement of defaultPrivilegeRevokeStatements(owner, role)) {
              await client.query(statement)
            }
          }
          for (const statement of targetPrivilegeRevokeStatements(role)) {
            await client.query(statement)
          }
          await client.query('COMMIT')
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined)
          throw error
        }
      })
    }
    await withPostgresClient(config, config.database, async (client) => {
      await client.query(
        `REVOKE ALL PRIVILEGES ON DATABASE ${quoteIdentifier(database)} FROM ${quoteIdentifier(role)}`,
      )
    })
  }

  private async loadTargetPrivilegeContext(
    config: DatabaseConnectionConfig,
    role: string,
    database: string,
  ): Promise<{ defaultOwners: readonly string[]; hasPublicSchema: boolean }> {
    return withPostgresClient(config, database, async (client) => {
      const schema = await client.query<SchemaRow>(
        `SELECT EXISTS (
          SELECT 1 FROM pg_namespace WHERE nspname = 'public'
        ) AS "hasPublicSchema"`,
      )
      const hasPublicSchema = schema.rows[0]?.hasPublicSchema ?? false
      if (!hasPublicSchema) return { defaultOwners: [], hasPublicSchema }

      const owners = await client.query<DefaultOwnerRow>(
        `SELECT DISTINCT owner.rolname AS owner,
          active_role.rolsuper
            OR owner.oid = active_role.oid
            OR pg_has_role(current_user, owner.oid, 'MEMBER') AS "canAlter"
        FROM pg_default_acl defaults
        JOIN pg_roles owner ON owner.oid = defaults.defaclrole
        CROSS JOIN pg_roles active_role
        CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege
        JOIN pg_roles grantee ON grantee.oid = privilege.grantee
        JOIN pg_namespace namespace ON namespace.oid = defaults.defaclnamespace
        WHERE active_role.rolname = current_user
          AND namespace.nspname = 'public'
          AND defaults.defaclobjtype IN ('r', 'S')
          AND grantee.rolname = $1`,
        [role],
      )
      if (owners.rows.some(({ canAlter }) => !canAlter)) {
        throw new ManagerError(
          'INSUFFICIENT_PRIVILEGE',
          'The administrator cannot revoke one or more default privileges.',
          403,
        )
      }
      return { defaultOwners: owners.rows.map(({ owner }) => owner), hasPublicSchema }
    })
  }

  private async assertAccessTargets(
    config: DatabaseConnectionConfig,
    command: CreatePrincipalCommand,
  ): Promise<void> {
    const databases = [...new Set(command.access.map(({ database }) => database))]
    if (databases.length === 0) return

    const rows = await withPostgresClient(config, config.database, async (client) => {
      const result = await client.query<AccessTargetRow>(
        `SELECT datname AS name, datallowconn AS "allowConnections"
         FROM pg_database WHERE datname = ANY($1::text[])`,
        [databases],
      )
      return result.rows
    })
    const targets = new Map(rows.map((row) => [row.name, row]))

    for (const requested of command.access) {
      const target = targets.get(requested.database)
      if (!target) {
        throw new ManagerError('DATABASE_NOT_FOUND', 'The database does not exist.', 404)
      }
      if (!target.allowConnections) {
        throw new ManagerError(
          'DATABASE_NOT_AVAILABLE',
          'The database does not accept connections.',
          409,
        )
      }
      if (requested.level === 'connect') continue

      const hasPublicSchema = await withPostgresClient(
        config,
        requested.database,
        async (client) => {
          const result = await client.query<SchemaRow>(
            `SELECT EXISTS (
              SELECT 1 FROM pg_namespace WHERE nspname = 'public'
            ) AS "hasPublicSchema"`,
          )
          return result.rows[0]?.hasPublicSchema ?? false
        },
      )
      if (!hasPublicSchema) {
        throw new ManagerError(
          'SCHEMA_NOT_FOUND',
          'The database does not contain the public schema.',
          404,
        )
      }
    }
  }

  private async applyAccess(
    config: DatabaseConnectionConfig,
    role: string,
    database: string,
    level: AccessLevel,
    warnings: string[],
  ): Promise<void> {
    await withPostgresClient(config, config.database, async (client) => {
      await client.query(
        `GRANT CONNECT ON DATABASE ${quoteIdentifier(database)} TO ${quoteIdentifier(role)}`,
      )
    })
    if (level === 'connect') return

    const owner = await withPostgresClient(config, config.database, async (client) => {
      const result = await client.query<OwnerRow>(
        'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1',
        [database],
      )
      return result.rows[0]?.owner ?? null
    })

    await withPostgresClient(config, database, async (client) => {
      for (const statement of accessStatements(level, role)) await client.query(statement)
      if (!owner) return
      try {
        for (const statement of defaultPrivilegeStatements(level, owner, role)) {
          await client.query(statement)
        }
      } catch {
        warnings.push(`Future-object grants could not be applied in ${database}.`)
      }
    })
  }
}
