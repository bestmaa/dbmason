import type { QueryResultRow } from 'pg'

import type { DatabaseConnectionConfig } from '../../domain/contracts'
import type {
  ActivityMetrics,
  ClusterIoCounters,
  DatabaseMetricCounters,
  MetricAvailability,
  ObservabilitySnapshot,
} from '../../domain/observability'
import { withPostgresClient } from './postgresClient'

const LONG_QUERY_THRESHOLD_MS = 5_000
const STATISTICS_LAG_HINT_MS = 1_000
const UTC_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'

interface MetadataRow extends QueryResultRow {
  currentDatabase: string
  hasFullStatsAccess: boolean
  inRecovery: boolean
  maxConnections: number
  reservedConnections: number
  sampledAt: string
  serverStartedAt: string
  superuserReservedConnections: number
  trackActivities: boolean
  trackCounts: boolean
  trackIoTiming: boolean
}

interface DatabaseMetricsRow extends QueryResultRow, DatabaseMetricCounters {}

interface IoRow extends QueryResultRow {
  evictions: string
  extendTimeMs: number
  extends: string
  fsyncs: string
  fsyncTimeMs: number
  hits: string
  readOperationBytes: string
  reads: string
  readTimeMs: number
  reuses: string
  statsResetAt: string | null
  writeOperationBytes: string
  writeTimeMs: number
  writebackTimeMs: number
  writebacks: string
  writes: string
}

interface ActivityRow extends QueryResultRow, ActivityMetrics {}

const metadataSql = `
  SELECT
    to_char(clock_timestamp() AT TIME ZONE 'UTC', '${UTC_FORMAT}') AS "sampledAt",
    to_char(pg_postmaster_start_time() AT TIME ZONE 'UTC', '${UTC_FORMAT}')
      AS "serverStartedAt",
    pg_is_in_recovery() AS "inRecovery",
    current_database() AS "currentDatabase",
    current_setting('track_activities')::boolean AS "trackActivities",
    current_setting('track_counts')::boolean AS "trackCounts",
    current_setting('track_io_timing')::boolean AS "trackIoTiming",
    current_setting('max_connections')::integer AS "maxConnections",
    current_setting('reserved_connections')::integer AS "reservedConnections",
    current_setting('superuser_reserved_connections')::integer
      AS "superuserReservedConnections",
    COALESCE((
      SELECT role.rolsuper OR pg_has_role(current_user, 'pg_read_all_stats', 'USAGE')
      FROM pg_roles role
      WHERE role.rolname = current_user
    ), false) AS "hasFullStatsAccess"
`

const databaseMetricsSql = `
  SELECT
    stat.datname AS database,
    GREATEST(
      stat.numbackends - CASE WHEN stat.datname = current_database() THEN 1 ELSE 0 END,
      0
    ) AS "currentConnections",
    CASE
      WHEN has_database_privilege(current_user, stat.datname, 'CONNECT')
        THEN pg_database_size(stat.datname)::text
      ELSE NULL
    END AS "sizeBytes",
    stat.xact_commit::text AS "transactionsCommitted",
    stat.xact_rollback::text AS "transactionsRolledBack",
    stat.blks_read::text AS "blocksRead",
    stat.blks_hit::text AS "bufferHits",
    CASE
      WHEN stat.blks_read::numeric + stat.blks_hit::numeric = 0 THEN NULL
      ELSE round(
        100 * stat.blks_hit::numeric / (stat.blks_read::numeric + stat.blks_hit::numeric),
        2
      )::double precision
    END AS "bufferCacheHitPercent",
    stat.conflicts::text AS "recoveryConflicts",
    stat.temp_files::text AS "temporaryFiles",
    stat.temp_bytes::text AS "temporaryBytes",
    stat.deadlocks::text AS deadlocks,
    stat.checksum_failures::text AS "checksumFailures",
    CASE WHEN stat.checksum_last_failure IS NULL THEN NULL ELSE
      to_char(stat.checksum_last_failure AT TIME ZONE 'UTC', '${UTC_FORMAT}')
    END AS "checksumLastFailureAt",
    stat.active_time AS "activeTimeMs",
    stat.idle_in_transaction_time AS "idleInTransactionTimeMs",
    stat.sessions::text AS sessions,
    stat.sessions_abandoned::text AS "sessionsAbandoned",
    stat.sessions_fatal::text AS "sessionsFatal",
    stat.sessions_killed::text AS "sessionsKilled",
    CASE WHEN stat.stats_reset IS NULL THEN NULL ELSE
      to_char(stat.stats_reset AT TIME ZONE 'UTC', '${UTC_FORMAT}')
    END AS "statsResetAt"
  FROM pg_stat_database stat
  WHERE stat.datname IS NOT NULL
  ORDER BY stat.datname
`

const ioSql = `
  SELECT
    COALESCE(sum(reads), 0)::text AS reads,
    COALESCE(sum(reads::numeric * op_bytes), 0)::text AS "readOperationBytes",
    COALESCE(sum(writes), 0)::text AS writes,
    COALESCE(sum(writes::numeric * op_bytes), 0)::text AS "writeOperationBytes",
    COALESCE(sum(writebacks), 0)::text AS writebacks,
    COALESCE(sum(extends), 0)::text AS extends,
    COALESCE(sum(hits), 0)::text AS hits,
    COALESCE(sum(evictions), 0)::text AS evictions,
    COALESCE(sum(reuses), 0)::text AS reuses,
    COALESCE(sum(fsyncs), 0)::text AS fsyncs,
    COALESCE(sum(read_time), 0)::double precision AS "readTimeMs",
    COALESCE(sum(write_time), 0)::double precision AS "writeTimeMs",
    COALESCE(sum(writeback_time), 0)::double precision AS "writebackTimeMs",
    COALESCE(sum(extend_time), 0)::double precision AS "extendTimeMs",
    COALESCE(sum(fsync_time), 0)::double precision AS "fsyncTimeMs",
    CASE WHEN min(stats_reset) IS NULL THEN NULL ELSE
      to_char(min(stats_reset) AT TIME ZONE 'UTC', '${UTC_FORMAT}')
    END AS "statsResetAt"
  FROM pg_stat_io
`

const activitySql = `
  SELECT
    count(*) FILTER (WHERE state = 'active')::integer AS active,
    count(*) FILTER (WHERE state = 'idle')::integer AS idle,
    count(*) FILTER (WHERE state LIKE 'idle in transaction%')::integer
      AS "idleInTransaction",
    count(*) FILTER (WHERE state = 'active' AND wait_event IS NOT NULL)::integer AS waiting,
    count(*) FILTER (WHERE state = 'active' AND wait_event_type = 'Lock')::integer AS blocked,
    count(*) FILTER (
      WHERE state = 'active'
        AND query_start <= clock_timestamp() - ($1::double precision * interval '1 millisecond')
    )::integer AS "longRunning"
  FROM pg_stat_activity
  WHERE backend_type = 'client backend'
    AND pid <> pg_backend_pid()
`

function requireRow<T>(row: T | undefined, source: string): T {
  if (row === undefined) throw new Error(`PostgreSQL returned no ${source} information`)
  return row
}

function mapIo(row: IoRow, timingEnabled: boolean): ClusterIoCounters {
  const timing: ClusterIoCounters['timing'] = timingEnabled
    ? {
        data: {
          extendTimeMs: row.extendTimeMs,
          fsyncTimeMs: row.fsyncTimeMs,
          readTimeMs: row.readTimeMs,
          writeTimeMs: row.writeTimeMs,
          writebackTimeMs: row.writebackTimeMs,
        },
        status: 'available',
      }
    : { reason: 'tracking-disabled', status: 'unavailable' }

  return {
    evictions: row.evictions,
    extends: row.extends,
    fsyncs: row.fsyncs,
    hits: row.hits,
    readOperationBytes: row.readOperationBytes,
    reads: row.reads,
    reuses: row.reuses,
    statsResetAt: row.statsResetAt,
    timing,
    writeOperationBytes: row.writeOperationBytes,
    writebacks: row.writebacks,
    writes: row.writes,
  }
}

function mapActivity(
  metadata: MetadataRow,
  row: ActivityRow | undefined,
): MetricAvailability<ActivityMetrics> {
  if (!metadata.trackActivities) return { reason: 'tracking-disabled', status: 'unavailable' }
  if (!metadata.hasFullStatsAccess) {
    return { reason: 'remote-stats-privilege-required', status: 'unavailable' }
  }
  return { data: requireRow(row, 'activity'), status: 'available' }
}

export async function getPostgresObservability(
  config: DatabaseConnectionConfig,
): Promise<ObservabilitySnapshot> {
  return withPostgresClient(config, config.database, async (client) => {
    await client.query('BEGIN READ ONLY')
    try {
      await client.query("SET LOCAL stats_fetch_consistency = 'snapshot'")
      const metadata = requireRow(
        (await client.query<MetadataRow>(metadataSql)).rows[0],
        'observability metadata',
      )
      const databases = (await client.query<DatabaseMetricsRow>(databaseMetricsSql)).rows
      const io = requireRow((await client.query<IoRow>(ioSql)).rows[0], 'I/O statistics')
      const activity =
        metadata.trackActivities && metadata.hasFullStatsAccess
          ? (await client.query<ActivityRow>(activitySql, [LONG_QUERY_THRESHOLD_MS])).rows[0]
          : undefined
      await client.query('COMMIT')

      const observed = databases.reduce((total, database) => total + database.currentConnections, 0)
      const regularCapacity = Math.max(
        0,
        metadata.maxConnections -
          metadata.reservedConnections -
          metadata.superuserReservedConnections,
      )
      const utilizationPercent =
        metadata.maxConnections === 0
          ? 0
          : Math.round((observed / metadata.maxConnections) * 10_000) / 100

      return {
        activity: mapActivity(metadata, activity),
        clusterIo: mapIo(io, metadata.trackIoTiming),
        collectionLagHintMs: STATISTICS_LAG_HINT_MS,
        connections: {
          configuredMaximum: metadata.maxConnections,
          observed,
          regularCapacity,
          reserved: metadata.reservedConnections,
          superuserReserved: metadata.superuserReservedConnections,
          utilizationPercent,
        },
        currentDatabase: metadata.currentDatabase,
        databases,
        engine: 'postgresql',
        hostTelemetry: { reason: 'external-provider-required', status: 'unavailable' },
        inRecovery: metadata.inRecovery,
        longQueryThresholdMs: LONG_QUERY_THRESHOLD_MS,
        sampledAt: metadata.sampledAt,
        scope: 'cluster',
        serverStartedAt: metadata.serverStartedAt,
        source: 'postgresql-statistics',
        tracking: {
          activities: metadata.trackActivities,
          counts: metadata.trackCounts,
          ioTiming: metadata.trackIoTiming,
        },
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    }
  })
}
