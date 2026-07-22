import type { Client, FieldDef, QueryResultRow } from 'pg'
import Cursor from 'pg-cursor'

import type {
  BrowseRelationCommand,
  LoadWorkspaceCatalogCommand,
  RelationKind,
  RelationSummary,
  RunReadOnlyQueryCommand,
  WorkspaceCell,
  WorkspaceCatalog,
  WorkspaceQueryResult,
} from '../../domain/workspace'
import type { DatabaseConnectionConfig } from '../../domain/contracts'
import { ManagerError } from '../../domain/errors'
import { quoteIdentifier } from './identifiers'
import { postgresWorkspaceOperationLimiter } from './operationLimiter'
import { withPostgresClient } from './postgresClient'

interface WorkspacePrincipalRow extends QueryResultRow {
  canCreateDatabase: boolean
  canCreateRole: boolean
  canLogin: boolean
  canReplicate: boolean
  bypassesRowSecurity: boolean
  hasUnsafeMembership: boolean
  isCurrentUser: boolean
  isSuperuser: boolean
  ownsDatabase: boolean
  ownsRelation: boolean
}

interface CatalogRow extends QueryResultRow {
  estimatedRows: string | null
  kind: string
  name: string
  schema: string
  sizeBytes: string | null
}

interface CursorResult {
  fields: readonly FieldDef[]
  rows: readonly unknown[][]
}

const catalogLimit = 500
const maximumCellCharacters = 32_768
const maximumResponseBytes = 1_048_576
const maximumSqlCharacters = 32_768

function readErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null
  return typeof error.code === 'string' ? error.code : null
}

function mapWorkspaceError(error: unknown): unknown {
  const code = readErrorCode(error)
  if (code === '42601' || code === '0A000') {
    return new ManagerError('QUERY_INVALID', 'Enter one PostgreSQL read-only query.', 400)
  }
  if (code === '25006') {
    return new ManagerError('QUERY_WRITE_BLOCKED', 'The read-only workspace blocked a write.', 409)
  }
  if (code === '57014') {
    return new ManagerError('QUERY_TIMEOUT', 'The query exceeded the five-second limit.', 408)
  }
  if (code === '42501') {
    return new ManagerError(
      'QUERY_PERMISSION_DENIED',
      'The selected PostgreSQL role cannot read this resource.',
      403,
    )
  }
  if (code === '42P01') {
    return new ManagerError('RELATION_NOT_FOUND', 'The PostgreSQL relation does not exist.', 404)
  }
  return error
}

function validateCredential(command: LoadWorkspaceCatalogCommand): void {
  quoteIdentifier(command.database)
  quoteIdentifier(command.principal)
  if (command.password.length === 0 || command.password.length > 1_024) {
    throw new ManagerError('INVALID_INPUT', 'Enter a valid PostgreSQL password.', 400)
  }
}

async function assertWorkspacePrincipal(
  config: DatabaseConnectionConfig,
  database: string,
  principal: string,
): Promise<void> {
  const role = await withPostgresClient(config, database, async (client) => {
    const result = await client.query<WorkspacePrincipalRow>(
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
        ) AS "hasUnsafeMembership",
        EXISTS (
          SELECT 1 FROM pg_database database
          JOIN effective ON effective.roleid = database.datdba
          WHERE database.datname = current_database()
        ) AS "ownsDatabase",
        EXISTS (
          SELECT 1 FROM pg_class relation
          JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
          JOIN effective ON effective.roleid = relation.relowner
          WHERE namespace.nspname <> 'information_schema'
            AND left(namespace.nspname, 3) <> 'pg_'
        ) AS "ownsRelation"
      FROM target role`,
      [principal],
    )
    return result.rows[0]
  })

  if (!role) {
    throw new ManagerError('PRINCIPAL_NOT_FOUND', 'The PostgreSQL role does not exist.', 404)
  }
  if (!role.canLogin) {
    throw new ManagerError(
      'QUERY_PRINCIPAL_NOLOGIN',
      'Choose a PostgreSQL role that can log in.',
      409,
    )
  }
  if (
    role.isCurrentUser ||
    role.isSuperuser ||
    role.canCreateDatabase ||
    role.canCreateRole ||
    role.canReplicate ||
    role.bypassesRowSecurity ||
    role.hasUnsafeMembership ||
    role.ownsDatabase ||
    role.ownsRelation
  ) {
    throw new ManagerError(
      'QUERY_PRINCIPAL_UNSAFE',
      'Privileged or object-owning PostgreSQL roles cannot use the read-only workspace.',
      409,
    )
  }
}

async function assertWorkspaceSessionSafe(client: Client, administrator: string): Promise<void> {
  const result = await client.query<WorkspacePrincipalRow>(
    `WITH RECURSIVE target AS (
      SELECT * FROM pg_roles WHERE rolname = current_user
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
      role.rolname = $1 AS "isCurrentUser",
      EXISTS (
        SELECT 1
        FROM effective
        JOIN pg_roles parent ON parent.oid = effective.roleid
        WHERE parent.rolname = $1
          OR parent.rolsuper
          OR parent.rolcreatedb
          OR parent.rolcreaterole
          OR parent.rolreplication
          OR parent.rolbypassrls
          OR left(parent.rolname, 3) = 'pg_'
      ) AS "hasUnsafeMembership",
      EXISTS (
        SELECT 1
        FROM pg_database database
        JOIN effective ON effective.roleid = database.datdba
        WHERE database.datname = current_database()
      ) AS "ownsDatabase",
      EXISTS (
        SELECT 1 FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        JOIN effective ON effective.roleid = relation.relowner
        WHERE namespace.nspname <> 'information_schema'
          AND left(namespace.nspname, 3) <> 'pg_'
      ) AS "ownsRelation"
    FROM target role`,
    [administrator],
  )
  const role = result.rows[0]
  if (
    !role ||
    !role.canLogin ||
    role.isCurrentUser ||
    role.isSuperuser ||
    role.canCreateDatabase ||
    role.canCreateRole ||
    role.canReplicate ||
    role.bypassesRowSecurity ||
    role.hasUnsafeMembership ||
    role.ownsDatabase ||
    role.ownsRelation
  ) {
    throw new ManagerError(
      'QUERY_PRINCIPAL_UNSAFE',
      'Privileged or object-owning PostgreSQL roles cannot use the read-only workspace.',
      409,
    )
  }
}

async function withWorkspaceDeadline<T>(client: Client, operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          client.connection.stream.destroy()
          reject(new ManagerError('QUERY_TIMEOUT', 'The query exceeded the hard time limit.', 408))
        }, 7_000)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function withReadOnlyWorkspaceClient<T>(
  config: DatabaseConnectionConfig,
  command: LoadWorkspaceCatalogCommand,
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  validateCredential(command)
  await assertWorkspacePrincipal(config, command.database, command.principal)
  const release = await postgresWorkspaceOperationLimiter.acquire()
  const workspaceConfig: DatabaseConnectionConfig = {
    ...config,
    database: command.database,
    password: command.password,
    username: command.principal,
  }

  try {
    return await withPostgresClient(workspaceConfig, command.database, async (client) => {
      await client.query('BEGIN READ ONLY')
      try {
        await client.query("SET LOCAL statement_timeout = '5000ms'")
        await client.query("SET LOCAL lock_timeout = '1000ms'")
        await client.query("SET LOCAL idle_in_transaction_session_timeout = '8000ms'")
        await client.query("SET LOCAL work_mem = '4MB'")
        await client.query('SET LOCAL row_security = on')
        await assertWorkspaceSessionSafe(client, config.username)
        const result = await withWorkspaceDeadline(client, operation(client))
        await client.query('ROLLBACK')
        return result
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw mapWorkspaceError(error)
      }
    })
  } finally {
    release()
  }
}

function relationKind(value: string): RelationKind {
  if (value === 'r') return 'table'
  if (value === 'p') return 'partitioned-table'
  if (value === 'v') return 'view'
  if (value === 'm') return 'materialized-view'
  if (value === 'f') return 'foreign-table'
  throw new ManagerError(
    'DATABASE_RESPONSE_INVALID',
    'PostgreSQL returned an unknown relation.',
    502,
  )
}

function truncateText(value: string): { truncated: boolean; value: string } {
  if (value.length <= maximumCellCharacters) return { truncated: false, value }
  return { truncated: true, value: `${value.slice(0, maximumCellCharacters)}…` }
}

function serializeCell(value: unknown): { cell: WorkspaceCell; truncated: boolean } {
  if (value === null || typeof value === 'boolean') return { cell: value, truncated: false }
  if (typeof value === 'number') {
    return { cell: Number.isFinite(value) ? value : String(value), truncated: false }
  }
  if (typeof value === 'bigint') return { cell: value.toString(), truncated: false }
  if (typeof value === 'string') {
    const result = truncateText(value)
    return { cell: result.value, truncated: result.truncated }
  }
  if (value instanceof Date) return { cell: value.toISOString(), truncated: false }
  if (Buffer.isBuffer(value)) {
    return { cell: `[binary ${value.length} bytes]`, truncated: value.length > 0 }
  }
  try {
    const json = JSON.stringify(value)
    if (json !== undefined) {
      const result = truncateText(json)
      return { cell: result.value, truncated: result.truncated }
    }
  } catch {
    // Fall through to a safe marker for values that cannot be serialized.
  }
  return { cell: '[unsupported value]', truncated: true }
}

function boundedResult(
  result: CursorResult,
  maximumRows: number,
  startedAt: number,
): WorkspaceQueryResult {
  const rawRows: unknown = result.rows
  if (!Array.isArray(rawRows)) {
    throw new ManagerError('DATABASE_RESPONSE_INVALID', 'PostgreSQL returned invalid rows.', 502)
  }
  const rows: WorkspaceCell[][] = []
  let responseBytes = 0
  let truncated = rawRows.length > maximumRows
  let truncatedCells = false

  for (const rawRow of rawRows.slice(0, maximumRows)) {
    if (!Array.isArray(rawRow)) {
      throw new ManagerError('DATABASE_RESPONSE_INVALID', 'PostgreSQL returned invalid rows.', 502)
    }
    const row = rawRow.map((value: unknown) => {
      const serialized = serializeCell(value)
      truncatedCells ||= serialized.truncated
      return serialized.cell
    })
    const rowBytes = Buffer.byteLength(JSON.stringify(row), 'utf8')
    if (responseBytes + rowBytes > maximumResponseBytes) {
      truncated = true
      break
    }
    responseBytes += rowBytes
    rows.push(row)
  }

  return {
    columns: result.fields.map((field) => ({ dataTypeId: field.dataTypeID, name: field.name })),
    durationMs: Math.round(performance.now() - startedAt),
    rowCount: rows.length,
    rows,
    truncated,
    truncatedCells,
  }
}

async function readBoundedCursor(
  client: Client,
  text: string,
  values: readonly unknown[],
  maximumRows: number,
): Promise<CursorResult> {
  const cursor = client.query(
    new Cursor<unknown[]>(text, [...values], {
      rowMode: 'array',
    }),
  )

  try {
    return await new Promise<CursorResult>((resolve, reject) => {
      cursor.read(maximumRows, (error, rows, result) => {
        if (error) {
          reject(error)
          return
        }
        if (result.fields.length === 0) {
          reject(
            new ManagerError('QUERY_INVALID', 'Enter a PostgreSQL query that returns rows.', 400),
          )
          return
        }
        resolve({ fields: result.fields, rows })
      })
    })
  } finally {
    await cursor.close().catch(() => undefined)
  }
}

export async function loadWorkspaceCatalog(
  config: DatabaseConnectionConfig,
  command: LoadWorkspaceCatalogCommand,
): Promise<WorkspaceCatalog> {
  return withReadOnlyWorkspaceClient(config, command, async (client) => {
    const result = await client.query<CatalogRow>(`
      SELECT namespace.nspname AS schema,
        relation.relname AS name,
        relation.relkind::text AS kind,
        CASE WHEN relation.reltuples < 0 THEN NULL
          ELSE relation.reltuples::bigint::text END AS "estimatedRows",
        CASE WHEN relation.relkind IN ('r', 'p', 'm')
          THEN pg_total_relation_size(relation.oid)::text ELSE NULL END AS "sizeBytes"
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND namespace.nspname <> 'information_schema'
        AND left(namespace.nspname, 3) <> 'pg_'
        AND has_schema_privilege(current_user, namespace.oid, 'USAGE')
        AND has_table_privilege(current_user, relation.oid, 'SELECT')
      ORDER BY namespace.nspname, relation.relname
      LIMIT 501
    `)
    return {
      database: command.database,
      relations: result.rows.slice(0, catalogLimit).map((row): RelationSummary => ({
        estimatedRows: row.estimatedRows,
        kind: relationKind(row.kind),
        name: row.name,
        schema: row.schema,
        sizeBytes: row.sizeBytes,
      })),
      truncated: result.rows.length > catalogLimit,
    }
  })
}

export async function browseWorkspaceRelation(
  config: DatabaseConnectionConfig,
  command: BrowseRelationCommand,
): Promise<WorkspaceQueryResult> {
  quoteIdentifier(command.schema)
  quoteIdentifier(command.relation)
  if (command.limit < 1 || command.limit > 200 || command.offset < 0 || command.offset > 100_000) {
    throw new ManagerError('INVALID_INPUT', 'Enter a valid workspace page.', 400)
  }
  return withReadOnlyWorkspaceClient(config, command, async (client) => {
    const startedAt = performance.now()
    const result = await readBoundedCursor(
      client,
      `SELECT * FROM ${quoteIdentifier(command.schema)}.${quoteIdentifier(command.relation)} OFFSET $1 LIMIT $2`,
      [command.offset, command.limit + 1],
      command.limit + 1,
    )
    return boundedResult(result, command.limit, startedAt)
  })
}

function normalizeReadOnlySql(sql: string): string {
  const normalized = sql.trim().replace(/;\s*$/u, '').trim()
  if (
    normalized.length === 0 ||
    normalized.length > maximumSqlCharacters ||
    normalized.includes('\0')
  ) {
    throw new ManagerError('QUERY_INVALID', 'Enter one PostgreSQL read-only query.', 400)
  }
  return normalized
}

export async function runWorkspaceReadOnlyQuery(
  config: DatabaseConnectionConfig,
  command: RunReadOnlyQueryCommand,
): Promise<WorkspaceQueryResult> {
  if (command.maxRows < 1 || command.maxRows > 200) {
    throw new ManagerError('INVALID_INPUT', 'Query row limit must be between 1 and 200.', 400)
  }
  const sql = normalizeReadOnlySql(command.sql)
  return withReadOnlyWorkspaceClient(config, command, async (client) => {
    const startedAt = performance.now()
    const result = await readBoundedCursor(client, sql, [], command.maxRows + 1)
    return boundedResult(result, command.maxRows, startedAt)
  })
}
