import type { Connection, RowDataPacket } from 'mysql2/promise'

import type {
  AccessLevel,
  ConnectionTestResult,
  CreateDatabaseCommand,
  CreatePrincipalCommand,
  CreatePrincipalResult,
  DatabaseConnectionConfig,
  DatabaseEngine,
  MysqlDatabaseSummary,
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
import type { MysqlObservabilitySnapshot } from '../../domain/observability'
import type {
  BrowseRelationCommand,
  LoadWorkspaceCatalogCommand,
  RunReadOnlyQueryCommand,
  WorkspaceCatalog,
  WorkspaceQueryResult,
} from '../../domain/workspace'
import { generateDatabasePassword } from '../security/passwordGenerator'
import { assertSafeMysqlAccount } from './accountSafety'
import { isMysqlSystemSchema, parseMysqlAccount, quoteMysqlAccount } from './identifiers'
import { quoteMysqlIdentifier } from './identifiers'
import { withMysqlConnection } from './mysqlClient'
import { mysqlBoolean } from './mysqlValues'
import { getMysqlObservability } from './MysqlObservability'
import {
  browseMysqlWorkspaceRelation,
  loadMysqlWorkspaceCatalog,
  runMysqlWorkspaceReadOnlyQuery,
} from './MysqlWorkspace'

interface ServerRow extends RowDataPacket {
  currentUser: string
  serverVersion: string
}

interface DatabaseRow extends RowDataPacket {
  defaultCharacterSet: string
  defaultCollation: string
  name: string
  sizeBytes: string | null
}

interface PrincipalRow extends RowDataPacket {
  canCreateDatabase: unknown
  canCreateRole: unknown
  canLogin: unknown
  isSuperuser: unknown
  name: string
}

interface RoleEdgeRow extends RowDataPacket {
  member: string
  role: string
}

interface ExistsRow extends RowDataPacket {
  found: unknown
}

interface TablePrivilegeRow extends RowDataPacket {
  privilege: string
  tableName: string
}

interface ColumnPrivilegeRow extends TablePrivilegeRow {
  columnName: string
}

interface RoutinePrivilegeRow extends RowDataPacket {
  privilegeList: string
  routineName: string
  routineType: string
}

const capabilities = {
  accessLevels: ['connect', 'read', 'write', 'developer'],
  canCreateDatabase: true,
  canCreatePrincipal: true,
  supportsDatabaseOwners: false,
  supportsDefaultPrivileges: false,
  supportsObservability: true,
  supportsReadOnlyWorkspace: true,
  supportsSchemas: false,
} as const

const tablePrivilegeAllowlist = new Set([
  'ALTER',
  'CREATE',
  'CREATE VIEW',
  'DELETE',
  'DROP',
  'INDEX',
  'INSERT',
  'REFERENCES',
  'SELECT',
  'SHOW VIEW',
  'TRIGGER',
  'UPDATE',
])
const columnPrivilegeAllowlist = new Set(['INSERT', 'REFERENCES', 'SELECT', 'UPDATE'])
const routinePrivilegeMap = new Map([
  ['Alter Routine', 'ALTER ROUTINE'],
  ['Execute', 'EXECUTE'],
])

function passwordLiteral(password: string): string {
  if (!/^[A-Za-z0-9_-]{22,86}$/u.test(password)) {
    throw new Error('Generated MySQL password is not SQL safe')
  }
  return `'${password}'`
}

function grantForLevel(level: AccessLevel): string | null {
  if (level === 'connect') return null
  if (level === 'read') return 'SELECT, SHOW VIEW'
  if (level === 'write') return 'SELECT, INSERT, UPDATE, DELETE, SHOW VIEW'
  return 'ALL PRIVILEGES'
}

function accessWarning(level: AccessLevel): string | null {
  if (level === 'connect') {
    return 'MySQL has no per-database CONNECT privilege; this preset leaves the account authentication-only.'
  }
  return null
}

async function databaseExists(connection: Connection, database: string): Promise<boolean> {
  const [rows] = await connection.query<ExistsRow[]>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.SCHEMATA schema_info
      WHERE schema_info.SCHEMA_NAME = ?
    ) AS found`,
    [database],
  )
  return mysqlBoolean(rows[0]?.found)
}

async function assertAccessDatabase(connection: Connection, database: string): Promise<void> {
  quoteMysqlIdentifier(database)
  if (isMysqlSystemSchema(database)) {
    throw new ManagerError(
      'DATABASE_PROTECTED',
      'DBMason does not grant access to MySQL system schemas.',
      409,
    )
  }
  if (!(await databaseExists(connection, database))) {
    throw new ManagerError('DATABASE_NOT_FOUND', 'The MySQL database does not exist.', 404)
  }
}

async function accountExists(connection: Connection, principal: string): Promise<boolean> {
  const account = parseMysqlAccount(principal)
  const [rows] = await connection.query<ExistsRow[]>(
    `SELECT EXISTS (
      SELECT 1 FROM mysql.user user WHERE user.User = ? AND user.Host = ?
    ) AS found`,
    [account.user, account.host],
  )
  return mysqlBoolean(rows[0]?.found)
}

async function revokeDirectDatabaseAccess(
  connection: Connection,
  principal: string,
  database: string,
): Promise<void> {
  const account = parseMysqlAccount(principal)
  const targetGrantee = `'${account.user}'@'${account.host}'`
  const [schemaRows] = await connection.query<ExistsRow[]>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.SCHEMA_PRIVILEGES privilege
      WHERE privilege.GRANTEE = ? AND privilege.TABLE_SCHEMA = ?
    ) AS found`,
    [targetGrantee, database],
  )
  const [tableRows] = await connection.query<TablePrivilegeRow[]>(
    `SELECT privilege.TABLE_NAME AS tableName, privilege.PRIVILEGE_TYPE AS privilege
    FROM information_schema.TABLE_PRIVILEGES privilege
    WHERE privilege.GRANTEE = ? AND privilege.TABLE_SCHEMA = ?
    ORDER BY privilege.TABLE_NAME, privilege.PRIVILEGE_TYPE`,
    [targetGrantee, database],
  )
  const [columnRows] = await connection.query<ColumnPrivilegeRow[]>(
    `SELECT privilege.TABLE_NAME AS tableName, privilege.COLUMN_NAME AS columnName,
      privilege.PRIVILEGE_TYPE AS privilege
    FROM information_schema.COLUMN_PRIVILEGES privilege
    WHERE privilege.GRANTEE = ? AND privilege.TABLE_SCHEMA = ?
    ORDER BY privilege.TABLE_NAME, privilege.PRIVILEGE_TYPE, privilege.COLUMN_NAME`,
    [targetGrantee, database],
  )
  const [routineRows] = await connection.query<RoutinePrivilegeRow[]>(
    `SELECT privilege.Routine_name AS routineName,
      privilege.Routine_type AS routineType,
      CAST(privilege.Proc_priv AS CHAR) AS privilegeList
    FROM mysql.procs_priv privilege
    WHERE privilege.User = ? AND privilege.Host = ? AND privilege.Db = ?
    ORDER BY privilege.Routine_type, privilege.Routine_name`,
    [account.user, account.host, database],
  )

  const columnGroups = new Map<string, { columns: string[]; privilege: string; table: string }>()
  for (const row of columnRows) {
    const privilege = row.privilege.toUpperCase()
    if (!columnPrivilegeAllowlist.has(privilege)) {
      throw new ManagerError(
        'PRIVILEGE_RECONCILIATION_UNSAFE',
        'MySQL returned an unsupported direct column privilege; no access was changed.',
        409,
      )
    }
    const key = `${row.tableName}\0${privilege}`
    const group = columnGroups.get(key) ?? { columns: [], privilege, table: row.tableName }
    group.columns.push(row.columnName)
    columnGroups.set(key, group)
  }
  const tableGroups = new Map<string, string[]>()
  for (const row of tableRows) {
    const privilege = row.privilege.toUpperCase()
    if (!tablePrivilegeAllowlist.has(privilege)) {
      throw new ManagerError(
        'PRIVILEGE_RECONCILIATION_UNSAFE',
        'MySQL returned an unsupported direct table privilege; access replacement stopped safely.',
        409,
      )
    }
    const privileges = tableGroups.get(row.tableName) ?? []
    privileges.push(privilege)
    tableGroups.set(row.tableName, privileges)
  }
  const routineRevokes: Array<{
    name: string
    privileges: string[]
    type: 'FUNCTION' | 'PROCEDURE'
  }> = []
  for (const routine of routineRows) {
    if (routine.routineType !== 'FUNCTION' && routine.routineType !== 'PROCEDURE') {
      throw new ManagerError(
        'PRIVILEGE_RECONCILIATION_UNSAFE',
        'MySQL returned an unsupported routine type; access replacement stopped safely.',
        409,
      )
    }
    const privileges: string[] = []
    for (const rawPrivilege of routine.privilegeList.split(',')) {
      const privilege = routinePrivilegeMap.get(rawPrivilege.trim())
      if (!privilege) {
        throw new ManagerError(
          'PRIVILEGE_RECONCILIATION_UNSAFE',
          'MySQL returned an unsupported routine privilege; access replacement stopped safely.',
          409,
        )
      }
      privileges.push(privilege)
    }
    routineRevokes.push({
      name: routine.routineName,
      privileges,
      type: routine.routineType,
    })
  }

  for (const group of columnGroups.values()) {
    const columns = group.columns.map(quoteMysqlIdentifier).join(', ')
    await connection.query(
      `REVOKE ${group.privilege} (${columns}) ON ${quoteMysqlIdentifier(database)}.${quoteMysqlIdentifier(group.table)} FROM ${quoteMysqlAccount(account)}`,
    )
  }
  for (const [table, privileges] of tableGroups) {
    await connection.query(
      `REVOKE ${privileges.join(', ')} ON ${quoteMysqlIdentifier(database)}.${quoteMysqlIdentifier(table)} FROM ${quoteMysqlAccount(account)}`,
    )
  }
  for (const routine of routineRevokes) {
    await connection.query(
      `REVOKE ${routine.privileges.join(', ')} ON ${routine.type} ${quoteMysqlIdentifier(database)}.${quoteMysqlIdentifier(routine.name)} FROM ${quoteMysqlAccount(account)}`,
    )
  }

  if (mysqlBoolean(schemaRows[0]?.found)) {
    await connection.query(
      `REVOKE ALL PRIVILEGES ON ${quoteMysqlIdentifier(database)}.* FROM ${quoteMysqlAccount(account)}`,
    )
  }
}

export class MysqlEngine implements DatabaseEngine {
  readonly id = 'mysql' as const

  testConnection(config: DatabaseConnectionConfig): Promise<ConnectionTestResult> {
    const startedAt = performance.now()
    return withMysqlConnection(config, config.database, async (connection) => {
      const [rows] = await connection.query<ServerRow[]>(
        'SELECT VERSION() AS serverVersion, CURRENT_USER() AS currentUser',
      )
      return {
        latencyMs: Math.round(performance.now() - startedAt),
        serverVersion: rows[0]?.serverVersion ?? 'Unknown',
      }
    })
  }

  async getSnapshot(config: DatabaseConnectionConfig): Promise<ServerSnapshot> {
    return withMysqlConnection(config, config.database, async (connection) => {
      const [serverRows] = await connection.query<ServerRow[]>(
        'SELECT VERSION() AS serverVersion, CURRENT_USER() AS currentUser',
      )
      const [databaseRows] = await connection.query<DatabaseRow[]>(`
        SELECT schema_info.SCHEMA_NAME AS name,
          schema_info.DEFAULT_CHARACTER_SET_NAME AS defaultCharacterSet,
          schema_info.DEFAULT_COLLATION_NAME AS defaultCollation,
          CAST(COALESCE(SUM(table_info.DATA_LENGTH + table_info.INDEX_LENGTH), 0) AS CHAR)
            AS sizeBytes
        FROM information_schema.SCHEMATA schema_info
        LEFT JOIN information_schema.TABLES table_info
          ON table_info.TABLE_SCHEMA = schema_info.SCHEMA_NAME
        GROUP BY schema_info.SCHEMA_NAME,
          schema_info.DEFAULT_CHARACTER_SET_NAME,
          schema_info.DEFAULT_COLLATION_NAME
        ORDER BY schema_info.SCHEMA_NAME
      `)
      const [principalRows] = await connection.query<PrincipalRow[]>(`
        SELECT CONCAT(user.User, '@', user.Host) AS name,
          user.account_locked = 'N' AS canLogin,
          user.Super_priv = 'Y' AS isSuperuser,
          user.Create_priv = 'Y' AS canCreateDatabase,
          user.Create_user_priv = 'Y' AS canCreateRole
        FROM mysql.user user
        ORDER BY user.User, user.Host
      `)
      const [roleRows] = await connection.query<RoleEdgeRow[]>(`
        SELECT CONCAT(edge.TO_USER, '@', edge.TO_HOST) AS member,
          CONCAT(edge.FROM_USER, '@', edge.FROM_HOST) AS role
        FROM mysql.role_edges edge
        ORDER BY member, role
      `)
      const server = serverRows[0]
      if (!server) throw new Error('MySQL returned no server information')
      const memberships = new Map<string, string[]>()
      for (const edge of roleRows) {
        const current = memberships.get(edge.member) ?? []
        current.push(edge.role)
        memberships.set(edge.member, current)
      }
      return {
        capabilities,
        currentUser: server.currentUser,
        databases: databaseRows.map((row): MysqlDatabaseSummary => {
          const size = row.sizeBytes === null ? null : Number(row.sizeBytes)
          return {
            defaultCharacterSet: row.defaultCharacterSet,
            defaultCollation: row.defaultCollation,
            engine: this.id,
            name: row.name,
            sizeBytes: size !== null && Number.isSafeInteger(size) ? size : null,
          }
        }),
        engine: this.id,
        principals: principalRows.map(
          (row): PrincipalSummary => ({
            canCreateDatabase: mysqlBoolean(row.canCreateDatabase),
            canCreateRole: mysqlBoolean(row.canCreateRole),
            canLogin: mysqlBoolean(row.canLogin),
            isSuperuser: mysqlBoolean(row.isSuperuser),
            memberships: memberships.get(row.name) ?? [],
            name: row.name,
            validUntil: null,
          }),
        ),
        serverVersion: server.serverVersion,
      }
    })
  }

  async createDatabase(
    config: DatabaseConnectionConfig,
    command: CreateDatabaseCommand,
  ): Promise<void> {
    if (command.owner !== null) {
      throw new ManagerError(
        'DATABASE_OWNER_UNSUPPORTED',
        'MySQL databases do not have a PostgreSQL-style owner.',
        400,
      )
    }
    if (isMysqlSystemSchema(command.name)) {
      throw new ManagerError('DATABASE_PROTECTED', 'That MySQL system schema is protected.', 409)
    }
    await withMysqlConnection(config, config.database, async (connection) => {
      await connection.query(
        `CREATE DATABASE ${quoteMysqlIdentifier(command.name)} CHARACTER SET utf8mb4`,
      )
    })
  }

  async createPrincipal(
    config: DatabaseConnectionConfig,
    command: CreatePrincipalCommand,
  ): Promise<CreatePrincipalResult> {
    const account = parseMysqlAccount(command.name)
    await withMysqlConnection(config, config.database, async (connection) => {
      if (await accountExists(connection, command.name)) {
        throw new ManagerError('ALREADY_EXISTS', 'The MySQL account already exists.', 409)
      }
      for (const access of command.access) await assertAccessDatabase(connection, access.database)
    })
    const password = generateDatabasePassword()
    await withMysqlConnection(config, config.database, async (connection) => {
      await connection.query(
        `CREATE USER ${quoteMysqlAccount(account)} IDENTIFIED BY ${passwordLiteral(password)}`,
      )
    })
    const warnings: string[] = []
    if (account.host === '%') {
      warnings.push(
        'The account host is %, so network policy and MySQL TLS remain important access boundaries.',
      )
    }
    try {
      for (const access of command.access) {
        const result = await this.setPrincipalAccess(config, {
          database: access.database,
          level: access.level,
          principal: command.name,
        })
        warnings.push(...result.warnings)
      }
    } catch (error) {
      await withMysqlConnection(config, config.database, (connection) =>
        connection
          .query(`DROP USER IF EXISTS ${quoteMysqlAccount(account)}`)
          .then(() => undefined),
      ).catch(() => undefined)
      throw error
    }
    return { oneTimePassword: password, principal: account.canonical, warnings }
  }

  async setPrincipalAccess(
    config: DatabaseConnectionConfig,
    command: PrincipalAccessCommand,
  ): Promise<PrincipalAccessResult> {
    return withMysqlConnection(config, config.database, async (connection) => {
      const account = await assertSafeMysqlAccount(connection, command.principal)
      await assertAccessDatabase(connection, command.database)
      await revokeDirectDatabaseAccess(connection, command.principal, command.database)
      const privileges = grantForLevel(command.level)
      if (privileges) {
        await connection.query(
          `GRANT ${privileges} ON ${quoteMysqlIdentifier(command.database)}.* TO ${quoteMysqlAccount(account)}`,
        )
      }
      const warning = accessWarning(command.level)
      return { warnings: warning ? [warning] : [] }
    })
  }

  async revokePrincipalAccess(
    config: DatabaseConnectionConfig,
    command: RevokePrincipalAccessCommand,
  ): Promise<PrincipalAccessResult> {
    return withMysqlConnection(config, config.database, async (connection) => {
      await assertSafeMysqlAccount(connection, command.principal)
      await assertAccessDatabase(connection, command.database)
      await revokeDirectDatabaseAccess(connection, command.principal, command.database)
      return { warnings: [] }
    })
  }

  async setPrincipalLogin(
    config: DatabaseConnectionConfig,
    command: SetPrincipalLoginCommand,
  ): Promise<void> {
    await withMysqlConnection(config, config.database, async (connection) => {
      const account = await assertSafeMysqlAccount(connection, command.principal)
      await connection.query(
        `ALTER USER ${quoteMysqlAccount(account)} ACCOUNT ${command.enabled ? 'UNLOCK' : 'LOCK'}`,
      )
    })
  }

  async rotatePrincipalPassword(
    config: DatabaseConnectionConfig,
    command: RotatePrincipalPasswordCommand,
  ): Promise<RotatePrincipalPasswordResult> {
    const password = generateDatabasePassword()
    await withMysqlConnection(config, config.database, async (connection) => {
      const account = await assertSafeMysqlAccount(connection, command.principal)
      await connection.query(
        `ALTER USER ${quoteMysqlAccount(account)} IDENTIFIED BY ${passwordLiteral(password)}`,
      )
    })
    return { oneTimePassword: password, principal: command.principal }
  }

  async dropPrincipal(
    config: DatabaseConnectionConfig,
    command: DropPrincipalCommand,
  ): Promise<void> {
    await withMysqlConnection(config, config.database, async (connection) => {
      const account = await assertSafeMysqlAccount(connection, command.principal)
      await connection.query(`DROP USER ${quoteMysqlAccount(account)}`)
    })
  }

  getObservability(config: DatabaseConnectionConfig): Promise<MysqlObservabilitySnapshot> {
    return getMysqlObservability(config)
  }

  loadWorkspaceCatalog(
    config: DatabaseConnectionConfig,
    command: LoadWorkspaceCatalogCommand,
  ): Promise<WorkspaceCatalog> {
    return loadMysqlWorkspaceCatalog(config, command)
  }

  browseWorkspaceRelation(
    config: DatabaseConnectionConfig,
    command: BrowseRelationCommand,
  ): Promise<WorkspaceQueryResult> {
    return browseMysqlWorkspaceRelation(config, command)
  }

  runWorkspaceReadOnlyQuery(
    config: DatabaseConnectionConfig,
    command: RunReadOnlyQueryCommand,
  ): Promise<WorkspaceQueryResult> {
    return runMysqlWorkspaceReadOnlyQuery(config, command)
  }
}
