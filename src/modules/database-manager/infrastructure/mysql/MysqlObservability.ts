import type { RowDataPacket } from 'mysql2/promise'

import type { DatabaseConnectionConfig } from '../../domain/contracts'
import type {
  ActivityMetrics,
  MetricAvailability,
  MysqlObservabilitySnapshot,
  MysqlServerStatusCounters,
} from '../../domain/observability'
import { withMysqlConnection } from './mysqlClient'
import { mysqlBoolean, mysqlNonnegativeInteger } from './mysqlValues'

const longQueryThresholdMs = 5_000

interface MetadataRow extends RowDataPacket {
  currentDatabase: string | null
  hasFullStatsAccess: unknown
  maxConnections: unknown
  readOnlyServer: unknown
  sampledAt: string
}

interface StatusRow extends RowDataPacket {
  Value: string
  Variable_name: string
}

interface DatabaseRow extends RowDataPacket {
  currentConnections: unknown
  database: string
  defaultCharacterSet: string
  defaultCollation: string
  sizeBytes: string | null
}

interface ActivityRow extends RowDataPacket {
  active: unknown
  blocked: unknown
  idle: unknown
  idleInTransaction: unknown
  longRunning: unknown
  waiting: unknown
}

const statusNames = [
  'Aborted_connects',
  'Bytes_received',
  'Bytes_sent',
  'Connections',
  'Created_tmp_disk_tables',
  'Queries',
  'Questions',
  'Slow_queries',
  'Threads_connected',
  'Threads_running',
  'Uptime',
] as const

function statusValue(status: ReadonlyMap<string, string>, name: (typeof statusNames)[number]): string {
  const value = status.get(name.toLowerCase())
  if (value === undefined || !/^\d+$/u.test(value)) {
    throw new Error(`MySQL did not return a valid ${name} status counter`)
  }
  return value
}

function integerStatus(
  status: ReadonlyMap<string, string>,
  name: (typeof statusNames)[number],
): number {
  const parsed = Number(statusValue(status, name))
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`MySQL returned an unsafe ${name} status counter`)
  }
  return parsed
}

function timestampToIso(timestamp: string): string {
  const parsed = new Date(`${timestamp.replace(' ', 'T')}Z`)
  if (Number.isNaN(parsed.valueOf())) throw new Error('MySQL returned an invalid timestamp')
  return parsed.toISOString()
}

function statusCounters(status: ReadonlyMap<string, string>): MysqlServerStatusCounters {
  return {
    abortedConnects: statusValue(status, 'Aborted_connects'),
    bytesReceived: statusValue(status, 'Bytes_received'),
    bytesSent: statusValue(status, 'Bytes_sent'),
    connections: statusValue(status, 'Connections'),
    createdTemporaryDiskTables: statusValue(status, 'Created_tmp_disk_tables'),
    queries: statusValue(status, 'Queries'),
    questions: statusValue(status, 'Questions'),
    slowQueries: statusValue(status, 'Slow_queries'),
    threadsRunning: mysqlObservedThreadsRunning(statusValue(status, 'Threads_running')),
  }
}

export function mysqlObservedThreadsRunning(value: unknown): number {
  return Math.max(0, mysqlNonnegativeInteger(value, 'running thread count') - 1)
}

function unavailableActivity(metadata: MetadataRow): MetricAvailability<ActivityMetrics> | null {
  if (!mysqlBoolean(metadata.hasFullStatsAccess)) {
    return { reason: 'remote-stats-privilege-required', status: 'unavailable' }
  }
  return null
}

function isStatsPrivilegeError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  const code = error.code
  return (
    code === 'ER_ACCESS_DENIED_ERROR' ||
    code === 'ER_DBACCESS_DENIED_ERROR' ||
    code === 'ER_SPECIFIC_ACCESS_DENIED_ERROR' ||
    code === 'ER_TABLEACCESS_DENIED_ERROR'
  )
}

export async function getMysqlObservability(
  config: DatabaseConnectionConfig,
): Promise<MysqlObservabilitySnapshot> {
  return withMysqlConnection(config, config.database, async (connection) => {
    await connection.query('START TRANSACTION READ ONLY')
    try {
      const [metadataRows] = await connection.query<MetadataRow[]>(`
        SELECT DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%d %H:%i:%s.%f') AS sampledAt,
          DATABASE() AS currentDatabase,
          @@GLOBAL.max_connections AS maxConnections,
          @@GLOBAL.read_only AS readOnlyServer,
          EXISTS (
            SELECT 1 FROM mysql.user user
            WHERE CONCAT(user.User, '@', user.Host) = CURRENT_USER()
              AND (user.Process_priv = 'Y' OR user.Super_priv = 'Y')
          ) AS hasFullStatsAccess
      `)
      const metadata = metadataRows[0]
      if (!metadata) throw new Error('MySQL returned no observability metadata')
      const [statusRows] = await connection.query<StatusRow[]>(
        `SHOW GLOBAL STATUS WHERE Variable_name IN (${statusNames.map(() => '?').join(', ')})`,
        [...statusNames],
      )
      const status = new Map(
        statusRows.map((row) => [row.Variable_name.toLowerCase(), String(row.Value)] as const),
      )
      const canSeeSessions = mysqlBoolean(metadata.hasFullStatsAccess)
      const [databaseRows] = await connection.query<DatabaseRow[]>(`
        SELECT schema_info.SCHEMA_NAME AS \`database\`,
          schema_info.DEFAULT_CHARACTER_SET_NAME AS defaultCharacterSet,
          schema_info.DEFAULT_COLLATION_NAME AS defaultCollation,
          CAST(COALESCE(table_sizes.sizeBytes, 0) AS CHAR) AS sizeBytes,
          ${canSeeSessions ? 'COALESCE(session_counts.currentConnections, 0)' : 'NULL'}
            AS currentConnections
        FROM information_schema.SCHEMATA schema_info
        LEFT JOIN (
          SELECT table_info.TABLE_SCHEMA AS databaseName,
            SUM(table_info.DATA_LENGTH + table_info.INDEX_LENGTH) AS sizeBytes
          FROM information_schema.TABLES table_info
          GROUP BY table_info.TABLE_SCHEMA
        ) table_sizes ON table_sizes.databaseName = schema_info.SCHEMA_NAME
        ${canSeeSessions ? `LEFT JOIN (
          SELECT process.DB AS databaseName, COUNT(*) AS currentConnections
          FROM information_schema.PROCESSLIST process
          WHERE process.ID <> CONNECTION_ID() AND process.DB IS NOT NULL
          GROUP BY process.DB
        ) session_counts ON session_counts.databaseName = schema_info.SCHEMA_NAME` : ''}
        WHERE schema_info.SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
        ORDER BY schema_info.SCHEMA_NAME
      `)
      let activity = unavailableActivity(metadata)
      if (!activity) {
        try {
          const [activityRows] = await connection.query<ActivityRow[]>(`
            SELECT
              CAST(COALESCE(SUM(process.COMMAND <> 'Sleep'), 0) AS UNSIGNED) AS active,
              CAST(COALESCE(SUM(process.COMMAND = 'Sleep'), 0) AS UNSIGNED) AS idle,
              CAST(COALESCE(SUM(
                process.COMMAND = 'Sleep' AND transaction.TRX_MYSQL_THREAD_ID IS NOT NULL
              ), 0) AS UNSIGNED) AS idleInTransaction,
              CAST(COALESCE(SUM(LOWER(COALESCE(process.STATE, '')) LIKE '%waiting%'), 0)
                AS UNSIGNED) AS waiting,
              CAST(COALESCE(SUM(
                LOWER(COALESCE(process.STATE, '')) LIKE '%lock%'
                AND LOWER(COALESCE(process.STATE, '')) LIKE '%wait%'
              ), 0) AS UNSIGNED) AS blocked,
              CAST(COALESCE(SUM(
                process.COMMAND <> 'Sleep' AND process.TIME * 1000 >= ?
              ), 0) AS UNSIGNED) AS longRunning
            FROM information_schema.PROCESSLIST process
            LEFT JOIN information_schema.INNODB_TRX transaction
              ON transaction.TRX_MYSQL_THREAD_ID = process.ID
            WHERE process.ID <> CONNECTION_ID()
          `, [longQueryThresholdMs])
          const row = activityRows[0]
          if (!row) throw new Error('MySQL returned no activity statistics')
          activity = {
            data: {
              active: mysqlNonnegativeInteger(row.active, 'active session count'),
              blocked: mysqlNonnegativeInteger(row.blocked, 'blocked session count'),
              idle: mysqlNonnegativeInteger(row.idle, 'idle session count'),
              idleInTransaction: mysqlNonnegativeInteger(
                row.idleInTransaction,
                'idle transaction count',
              ),
              longRunning: mysqlNonnegativeInteger(row.longRunning, 'long query count'),
              waiting: mysqlNonnegativeInteger(row.waiting, 'waiting session count'),
            },
            status: 'available',
          }
        } catch (error) {
          if (!isStatsPrivilegeError(error)) throw error
          activity = { reason: 'remote-stats-privilege-required', status: 'unavailable' }
        }
      }
      await connection.query('COMMIT')

      const sampledAt = timestampToIso(metadata.sampledAt.slice(0, 23))
      const uptimeSeconds = integerStatus(status, 'Uptime')
      const maxConnections = mysqlNonnegativeInteger(metadata.maxConnections, 'max_connections')
      const observed = Math.max(0, integerStatus(status, 'Threads_connected') - 1)
      return {
        activity,
        collectionLagHintMs: 0,
        connections: {
          configuredMaximum: maxConnections + 1,
          observed,
          regularCapacity: maxConnections,
          reserved: 0,
          superuserReserved: 1,
          utilizationPercent:
            maxConnections === 0 ? 0 : Math.round((observed / maxConnections) * 10_000) / 100,
        },
        currentDatabase: metadata.currentDatabase ?? config.database,
        databases: databaseRows.map((row) => ({
          currentConnections:
            row.currentConnections === null
              ? null
              : mysqlNonnegativeInteger(row.currentConnections, 'database connection count'),
          database: row.database,
          defaultCharacterSet: row.defaultCharacterSet,
          defaultCollation: row.defaultCollation,
          sizeBytes: row.sizeBytes,
        })),
        engine: 'mysql',
        hostTelemetry: { reason: 'external-provider-required', status: 'unavailable' },
        longQueryThresholdMs,
        readOnlyServer: mysqlBoolean(metadata.readOnlyServer),
        sampledAt,
        scope: 'server',
        serverStartedAt: new Date(
          new Date(sampledAt).valueOf() - uptimeSeconds * 1_000,
        ).toISOString(),
        serverStatus: statusCounters(status),
        source: 'mysql-server-status',
        tracking: {
          activities: activity.status === 'available',
          counts: true,
          ioTiming: false,
        },
      }
    } catch (error) {
      await connection.query('ROLLBACK').catch(() => undefined)
      throw error
    }
  })
}
