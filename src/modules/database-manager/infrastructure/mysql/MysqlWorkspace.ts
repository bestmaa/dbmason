import { createConnection } from 'mysql2'
import type { Connection as CoreConnection, FieldPacket, RowDataPacket } from 'mysql2'

import type { DatabaseConnectionConfig } from '../../domain/contracts'
import { ManagerError } from '../../domain/errors'
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
import { resolveAllowedDatabaseHost } from '../network/databaseHostPolicy'
import { assertSafeMysqlAccount } from './accountSafety'
import { parseMysqlAccount, quoteMysqlIdentifier } from './identifiers'
import {
  assertMysqlPeerIdentity,
  connectionOptions,
  shouldRetryWithoutTls,
  withMysqlConnection,
} from './mysqlClient'
import { mysqlOperationLimiter, mysqlWorkspaceOperationLimiter } from './operationLimiter'

interface CatalogRow extends RowDataPacket {
  estimatedRows: string | null
  kind: string
  name: string
  schema: string
  sizeBytes: string | null
}

interface CurrentAccountRow extends RowDataPacket {
  currentAccount: string
}

const catalogLimit = 500
const maximumCellCharacters = 32_768
const maximumResponseBytes = 1_048_576
const maximumSqlCharacters = 32_768

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return ''
  return typeof error.code === 'string' ? error.code : ''
}

function mapWorkspaceError(error: unknown): unknown {
  const code = errorCode(error)
  if (['ER_PARSE_ERROR', 'ER_EMPTY_QUERY'].includes(code)) {
    return new ManagerError('QUERY_INVALID', 'Enter one MySQL read-only query.', 400)
  }
  if (
    ['ER_READ_ONLY_TRANSACTION', 'ER_OPTION_PREVENTS_STATEMENT', 'ER_CANT_EXECUTE_IN_READ_ONLY_TRANSACTION'].includes(
      code,
    )
  ) {
    return new ManagerError('QUERY_WRITE_BLOCKED', 'The read-only workspace blocked a write.', 409)
  }
  if (['ER_QUERY_TIMEOUT', 'PROTOCOL_SEQUENCE_TIMEOUT'].includes(code)) {
    return new ManagerError('QUERY_TIMEOUT', 'The query exceeded the five-second limit.', 408)
  }
  if (
    ['ER_ACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR', 'ER_TABLEACCESS_DENIED_ERROR', 'ER_PROCACCESS_DENIED_ERROR'].includes(
      code,
    )
  ) {
    return new ManagerError(
      'QUERY_PERMISSION_DENIED',
      'The selected MySQL account cannot read this resource.',
      403,
    )
  }
  if (code === 'ER_NO_SUCH_TABLE') {
    return new ManagerError('RELATION_NOT_FOUND', 'The MySQL table or view does not exist.', 404)
  }
  return error
}

function connect(connection: CoreConnection): Promise<void> {
  return new Promise((resolve, reject) => {
    connection.connect((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function openWorkspaceConnection(
  config: DatabaseConnectionConfig,
  command: LoadWorkspaceCatalogCommand,
): Promise<CoreConnection> {
  const account = parseMysqlAccount(command.principal)
  const resolvedHost = await resolveAllowedDatabaseHost(config.host)
  const workspaceConfig = { ...config, password: command.password, username: account.user }
  let connection = createConnection(connectionOptions(workspaceConfig, command.database, resolvedHost))
  try {
    await connect(connection)
    assertMysqlPeerIdentity(connection, workspaceConfig)
    return connection
  } catch (error) {
    connection.destroy()
    if (config.sslMode !== 'prefer' || !shouldRetryWithoutTls(error)) throw error
    connection = createConnection(
      connectionOptions(
        { ...workspaceConfig, sslMode: 'disable' },
        command.database,
        resolvedHost,
      ),
    )
    await connect(connection)
    assertMysqlPeerIdentity(connection, { ...workspaceConfig, sslMode: 'disable' })
    return connection
  }
}

function normalizeGrantRow(row: RowDataPacket): string {
  const value: unknown = Object.values(row)[0]
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function splitPrivilegeList(value: string): string[] | null {
  const privileges: string[] = []
  let current = ''
  let inIdentifier = false
  let parenthesisDepth = 0
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === '`') {
      if (inIdentifier && value[index + 1] === '`') {
        current += '``'
        index += 1
        continue
      }
      inIdentifier = !inIdentifier
    } else if (!inIdentifier && character === '(') {
      parenthesisDepth += 1
    } else if (!inIdentifier && character === ')') {
      parenthesisDepth -= 1
      if (parenthesisDepth < 0) return null
    } else if (!inIdentifier && parenthesisDepth === 0 && character === ',') {
      if (current.trim().length === 0) return null
      privileges.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  if (inIdentifier || parenthesisDepth !== 0 || current.trim().length === 0) return null
  privileges.push(current.trim())
  return privileges
}

function isSafeWorkspacePrivilege(value: string): boolean {
  if (
    value === 'SELECT' ||
    value === 'SHOW VIEW' ||
    value === 'INSERT' ||
    value === 'UPDATE' ||
    value === 'DELETE'
  ) {
    return true
  }
  const match = /^(SELECT|INSERT|UPDATE)\s+\((.*)\)$/u.exec(value)
  if (!match?.[2]) return false
  return match[2]
    .split(',')
    .map((column) => column.trim())
    .every((column) => /^`(?:``|[^`])+`$/u.test(column))
}

export function isSafeMysqlWorkspaceGrant(rawGrant: string): boolean {
  const grant = rawGrant.trim().toUpperCase()
  if (grant.length === 0 || grant.includes('WITH GRANT OPTION')) return false
  if (grant.startsWith('GRANT USAGE ON *.* TO ')) return true
  if (!grant.startsWith('GRANT ')) return false
  const onIndex = grant.indexOf(' ON ', 6)
  const toIndex = onIndex < 0 ? -1 : grant.indexOf(' TO ', onIndex + 4)
  if (onIndex < 0 || toIndex < 0) return false
  const privileges = splitPrivilegeList(grant.slice(6, onIndex))
  const scope = grant.slice(onIndex + 4, toIndex).trim()
  if (!privileges || !/^`(?:``|[^`])+`\.(?:\*|`(?:``|[^`])+`)$/u.test(scope)) return false
  return privileges.every(isSafeWorkspacePrivilege)
}

async function assertWorkspaceSessionSafe(
  connection: CoreConnection,
  expectedPrincipal: string,
): Promise<void> {
  const promised = connection.promise()
  const [identityRows] = await promised.query<CurrentAccountRow[]>(
    'SELECT CURRENT_USER() AS currentAccount',
  )
  const expected = parseMysqlAccount(expectedPrincipal)
  const current = identityRows[0]?.currentAccount
  const currentAccount = current ? parseMysqlAccount(current) : null
  if (
    !currentAccount ||
    currentAccount.user !== expected.user ||
    currentAccount.host.toLowerCase() !== expected.host.toLowerCase()
  ) {
    throw new ManagerError(
      'QUERY_PRINCIPAL_UNSAFE',
      'MySQL authenticated a different user@host account than the selected account.',
      409,
    )
  }
  const [grantRows] = await promised.query<RowDataPacket[]>('SHOW GRANTS FOR CURRENT_USER')
  const unsafe = grantRows
    .map(normalizeGrantRow)
    .some((grant) => !isSafeMysqlWorkspaceGrant(grant))
  if (unsafe) {
    throw new ManagerError(
      'QUERY_PRINCIPAL_UNSAFE',
      'Only directly scoped MySQL read/write data grants are allowed in the workspace.',
      409,
    )
  }
}

async function setupReadOnlySession(connection: CoreConnection): Promise<void> {
  const promised = connection.promise()
  await promised.query('SET SESSION max_execution_time = 5000')
  await promised.query('SET SESSION innodb_lock_wait_timeout = 1')
  await promised.query('SET SESSION lock_wait_timeout = 1')
  await promised.query('SET SESSION tmp_table_size = 4194304')
  await promised.query('SET SESSION max_heap_table_size = 4194304')
  await promised.query('SET SESSION sql_select_limit = 201')
  await promised.query('START TRANSACTION READ ONLY')
}

async function withReadOnlyMysqlWorkspace<T>(
  config: DatabaseConnectionConfig,
  command: LoadWorkspaceCatalogCommand,
  operation: (connection: CoreConnection) => Promise<T>,
): Promise<T> {
  if (command.password.length === 0 || command.password.length > 1_024) {
    throw new ManagerError('INVALID_INPUT', 'Enter a valid MySQL password.', 400)
  }
  quoteMysqlIdentifier(command.database)
  await withMysqlConnection(config, config.database, (connection) =>
    assertSafeMysqlAccount(connection, command.principal, {
      database: command.database,
      workspace: true,
    }).then(() => undefined),
  )
  const releaseWorkspace = await mysqlWorkspaceOperationLimiter.acquire()
  let releaseGlobal: (() => void) | null = null
  let connection: CoreConnection | null = null
  let hardDeadline: ReturnType<typeof setTimeout> | undefined
  try {
    releaseGlobal = await mysqlOperationLimiter.acquire()
    connection = await openWorkspaceConnection(config, command)
    const activeConnection = connection
    hardDeadline = setTimeout(() => activeConnection.destroy(), 7_000)
    await setupReadOnlySession(connection)
    await assertWorkspaceSessionSafe(connection, command.principal)
    const result = await operation(connection)
    await connection.promise().query('ROLLBACK').catch(() => undefined)
    return result
  } catch (error) {
    if (connection) await connection.promise().query('ROLLBACK').catch(() => undefined)
    if (errorCode(error) === 'PROTOCOL_CONNECTION_LOST') {
      throw new ManagerError('QUERY_TIMEOUT', 'The query exceeded the hard time limit.', 408)
    }
    throw mapWorkspaceError(error)
  } finally {
    if (hardDeadline) clearTimeout(hardDeadline)
    connection?.destroy()
    releaseGlobal?.()
    releaseWorkspace()
  }
}

function relationKind(value: string): RelationKind {
  if (value === 'BASE TABLE') return 'table'
  if (value === 'VIEW') return 'view'
  throw new ManagerError('DATABASE_RESPONSE_INVALID', 'MySQL returned an unknown relation.', 502)
}

function serializeCell(value: unknown): { cell: WorkspaceCell; truncated: boolean } {
  if (value === null || typeof value === 'boolean') return { cell: value, truncated: false }
  if (typeof value === 'number') {
    return { cell: Number.isFinite(value) ? value : String(value), truncated: false }
  }
  if (typeof value === 'bigint') return { cell: value.toString(), truncated: false }
  if (Buffer.isBuffer(value)) {
    return { cell: `[binary ${value.length} bytes]`, truncated: value.length > 0 }
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text === undefined) return { cell: '[unsupported value]', truncated: true }
  if (text.length <= maximumCellCharacters) return { cell: text, truncated: false }
  return { cell: `${text.slice(0, maximumCellCharacters)}…`, truncated: true }
}

interface StreamedResult {
  columns: WorkspaceQueryResult['columns']
  rows: WorkspaceCell[][]
  truncated: boolean
  truncatedCells: boolean
}

async function streamBoundedQuery(
  connection: CoreConnection,
  sql: string,
  maximumRows: number,
): Promise<StreamedResult> {
  const queryStartedAt = performance.now()
  const query = connection.query({ rowsAsArray: true, sql, timeout: 5_500 })
  let fields: readonly FieldPacket[] = []
  query.on('fields', (received) => {
    const candidate: unknown = received
    if (Array.isArray(candidate)) fields = candidate as FieldPacket[]
  })
  const stream = query.stream({ highWaterMark: 1 })
  const rows: WorkspaceCell[][] = []
  let responseBytes = 0
  let truncated = false
  let truncatedCells = false
  try {
    for await (const candidate of stream) {
      const raw: unknown = candidate
      if (!Array.isArray(raw)) continue
      if (rows.length >= maximumRows) {
        truncated = true
        stream.destroy()
        connection.destroy()
        break
      }
      const row = raw.map((value: unknown) => {
        const serialized = serializeCell(value)
        truncatedCells ||= serialized.truncated
        return serialized.cell
      })
      const bytes = Buffer.byteLength(JSON.stringify(row), 'utf8')
      if (responseBytes + bytes > maximumResponseBytes) {
        truncated = true
        stream.destroy()
        connection.destroy()
        break
      }
      responseBytes += bytes
      rows.push(row)
    }
  } catch (error) {
    if (!truncated) throw error
  }
  if (fields.length === 0) {
    throw new ManagerError('QUERY_INVALID', 'Enter a MySQL query that returns rows.', 400)
  }
  // MySQL can interrupt SLEEP()/BENCHMARK() at max_execution_time yet return a
  // sentinel row instead of an error. Treat a result at the server ceiling as
  // a timeout so an interrupted expression is never presented as real data.
  if (performance.now() - queryStartedAt >= 4_900) {
    throw new ManagerError('QUERY_TIMEOUT', 'The query exceeded the five-second limit.', 408)
  }
  return {
    columns: fields.map((field) => ({ dataTypeId: field.columnType ?? 0, name: field.name })),
    rows,
    truncated,
    truncatedCells,
  }
}

function queryResult(result: StreamedResult, startedAt: number): WorkspaceQueryResult {
  return {
    ...result,
    durationMs: Math.round(performance.now() - startedAt),
    rowCount: result.rows.length,
  }
}

export function loadMysqlWorkspaceCatalog(
  config: DatabaseConnectionConfig,
  command: LoadWorkspaceCatalogCommand,
): Promise<WorkspaceCatalog> {
  return withReadOnlyMysqlWorkspace(config, command, async (connection) => {
    const [rows] = await connection.promise().query<CatalogRow[]>(`
      SELECT table_info.TABLE_SCHEMA AS \`schema\`,
        table_info.TABLE_NAME AS name,
        table_info.TABLE_TYPE AS kind,
        CAST(table_info.TABLE_ROWS AS CHAR) AS estimatedRows,
        CAST(COALESCE(table_info.DATA_LENGTH + table_info.INDEX_LENGTH, 0) AS CHAR) AS sizeBytes
      FROM information_schema.TABLES table_info
      WHERE table_info.TABLE_SCHEMA = DATABASE()
        AND table_info.TABLE_TYPE IN ('BASE TABLE', 'VIEW')
      ORDER BY table_info.TABLE_NAME
      LIMIT 501
    `)
    return {
      database: command.database,
      relations: rows.slice(0, catalogLimit).map((row): RelationSummary => ({
        estimatedRows: row.estimatedRows,
        kind: relationKind(row.kind),
        name: row.name,
        schema: row.schema,
        sizeBytes: row.sizeBytes,
      })),
      truncated: rows.length > catalogLimit,
    }
  })
}

export function browseMysqlWorkspaceRelation(
  config: DatabaseConnectionConfig,
  command: BrowseRelationCommand,
): Promise<WorkspaceQueryResult> {
  if (
    command.schema !== command.database ||
    command.limit < 1 ||
    command.limit > 200 ||
    command.offset < 0 ||
    command.offset > 100_000
  ) {
    throw new ManagerError('INVALID_INPUT', 'Enter a valid MySQL workspace page.', 400)
  }
  const database = quoteMysqlIdentifier(command.schema)
  const relation = quoteMysqlIdentifier(command.relation)
  return withReadOnlyMysqlWorkspace(config, command, async (connection) => {
    const startedAt = performance.now()
    const result = await streamBoundedQuery(
      connection,
      `SELECT * FROM ${database}.${relation} LIMIT ${command.limit + 1} OFFSET ${command.offset}`,
      command.limit,
    )
    return queryResult(result, startedAt)
  })
}

function normalizeReadOnlySql(sql: string): string {
  const normalized = sql.trim().replace(/;\s*$/u, '').trim()
  if (
    normalized.length === 0 ||
    normalized.length > maximumSqlCharacters ||
    normalized.includes('\0')
  ) {
    throw new ManagerError('QUERY_INVALID', 'Enter one MySQL read-only query.', 400)
  }
  return normalized
}

export function runMysqlWorkspaceReadOnlyQuery(
  config: DatabaseConnectionConfig,
  command: RunReadOnlyQueryCommand,
): Promise<WorkspaceQueryResult> {
  if (command.maxRows < 1 || command.maxRows > 200) {
    throw new ManagerError('INVALID_INPUT', 'Query row limit must be between 1 and 200.', 400)
  }
  const sql = normalizeReadOnlySql(command.sql)
  return withReadOnlyMysqlWorkspace(config, command, async (connection) => {
    const startedAt = performance.now()
    const result = await streamBoundedQuery(connection, sql, command.maxRows)
    return queryResult(result, startedAt)
  })
}
