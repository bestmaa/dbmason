import type { EngineId } from '@/modules/database-manager/domain/contracts'
import type {
  MetricUnavailableReason,
  MysqlObservabilitySnapshot,
  ObservabilitySnapshot,
  PostgresObservabilitySnapshot,
} from '@/modules/database-manager/domain/observability'

import { enginePresentation } from './enginePresentation'
export type ObservabilityPanelState = 'error' | 'idle' | 'loading' | 'ready'
export interface ObservabilityMetricViewModel {
  detail: string
  label: string
  tone: 'danger' | 'neutral' | 'warning'
  value: string
}
export interface ObservabilityDatabaseTableViewModel {
  caption: string
  columns: readonly string[]
  emptyMessage: string
  note: string
  rows: readonly { database: string; values: readonly string[] }[]
}
export interface ObservabilityDetailPanelViewModel {
  ariaLabel: string
  eyebrow: string
  metrics: readonly { detail: string; label: string; value: string }[]
  note: string
  title: string
}
export interface ObservabilityPanelModel {
  databaseTable: ObservabilityDatabaseTableViewModel
  detailPanel: ObservabilityDetailPanelViewModel
  error: string | null
  hostTelemetryMessage: string
  loadAriaLabel: string
  loadingLabel: string
  metrics: readonly ObservabilityMetricViewModel[]
  refreshing: boolean
  sampledAtLabel: string | null
  sectionAriaLabel: string
  serverMode: string | null
  state: ObservabilityPanelState
  trackingNotes: readonly string[]
}
export interface ObservabilityPanelActions {
  refresh: () => void
}
interface ObservabilityPanelSource {
  engine: EngineId | null
  error: string | null
  pending: boolean
  snapshot: ObservabilitySnapshot | null
}
function formatCounter(value: string): string {
  return BigInt(value).toLocaleString('en-US')
}
function formatBytes(value: string | null): string {
  if (value === null) return 'Unavailable'
  const bytes = BigInt(value)
  const units = [
    { label: 'TB', size: 1_099_511_627_776n },
    { label: 'GB', size: 1_073_741_824n },
    { label: 'MB', size: 1_048_576n },
    { label: 'KB', size: 1_024n },
  ] as const
  const unit = units.find(({ size }) => bytes >= size)
  if (!unit) return `${formatCounter(value)} B`
  const tenths = (bytes * 10n) / unit.size
  return `${tenths / 10n}.${tenths % 10n} ${unit.label}`
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`
  const seconds = Math.floor(milliseconds / 1_000)
  if (seconds < 60) return `${seconds} sec`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ${minutes % 60} min`
  const days = Math.floor(hours / 24)
  return `${days} d ${hours % 24} hr`
}

function unavailableActivityDetail(reason: MetricUnavailableReason, engine: EngineId): string {
  if (reason === 'performance-schema-disabled') return 'MySQL Performance Schema is disabled.'
  if (reason === 'tracking-disabled') return 'PostgreSQL activity tracking is disabled.'
  return engine === 'postgresql'
    ? 'Grant pg_read_all_stats for cluster activity.'
    : 'The administrator needs remote statistics visibility.'
}

function buildMetrics(snapshot: ObservabilitySnapshot): readonly ObservabilityMetricViewModel[] {
  const connection = snapshot.connections
  const reserved = connection.reserved + connection.superuserReserved
  const metrics: ObservabilityMetricViewModel[] = [
    {
      detail: `${connection.utilizationPercent.toFixed(1)}% used · ${reserved} reserved slots`,
      label: 'Connections',
      tone: connection.utilizationPercent >= 85 ? 'warning' : 'neutral',
      value: `${connection.observed} / ${connection.configuredMaximum}`,
    },
  ]
  if (snapshot.activity.status === 'unavailable') {
    const detail = unavailableActivityDetail(snapshot.activity.reason, snapshot.engine)
    return [
      ...metrics,
      ...['Active sessions', 'Blocked', 'Waiting', 'Long-running'].map((label) => ({
        detail,
        label,
        tone: 'warning' as const,
        value: 'Restricted',
      })),
    ]
  }
  const activity = snapshot.activity.data
  return [
    ...metrics,
    { detail: `${activity.idle} idle · ${activity.idleInTransaction} idle in transaction`, label: 'Active sessions', tone: 'neutral', value: String(activity.active) },
    { detail: 'Sessions blocked by a lock', label: 'Blocked', tone: activity.blocked > 0 ? 'danger' : 'neutral', value: String(activity.blocked) },
    { detail: 'Sessions waiting in the database engine', label: 'Waiting', tone: activity.waiting > 0 ? 'warning' : 'neutral', value: String(activity.waiting) },
    { detail: `Threshold ${formatDuration(snapshot.longQueryThresholdMs)}`, label: 'Long-running', tone: activity.longRunning > 0 ? 'warning' : 'neutral', value: String(activity.longRunning) },
  ]
}

function postgresDatabaseTable(
  snapshot: PostgresObservabilitySnapshot,
): ObservabilityDatabaseTableViewModel {
  return {
    caption: 'PostgreSQL database observability counters',
    columns: ['Connections', 'Transactions', 'Cache hit', 'Temporary data', 'Deadlocks', 'Size'],
    emptyMessage: 'No PostgreSQL database counters were returned.',
    note: 'Transactions show committed / rolled back since statistics reset.',
    rows: snapshot.databases.map((database) => ({
      database: database.database,
      values: [
        String(database.currentConnections),
        `${formatCounter(database.transactionsCommitted)} / ${formatCounter(database.transactionsRolledBack)}`,
        database.bufferCacheHitPercent === null ? 'No reads yet' : `${database.bufferCacheHitPercent.toFixed(1)}%`,
        `${formatBytes(database.temporaryBytes)} · ${formatCounter(database.temporaryFiles)} files`,
        formatCounter(database.deadlocks),
        formatBytes(database.sizeBytes),
      ],
    })),
  }
}

function mysqlDatabaseTable(snapshot: MysqlObservabilitySnapshot): ObservabilityDatabaseTableViewModel {
  return {
    caption: 'MySQL database inventory metrics',
    columns: ['Connections', 'Character set', 'Collation', 'Size'],
    emptyMessage: 'No MySQL database metrics were returned.',
    note: 'Only native per-database values are shown; global status is kept separate.',
    rows: snapshot.databases.map((database) => ({
      database: database.database,
      values: [
        database.currentConnections === null ? 'Unavailable' : String(database.currentConnections),
        database.defaultCharacterSet,
        database.defaultCollation,
        formatBytes(database.sizeBytes),
      ],
    })),
  }
}

function postgresDetail(snapshot: PostgresObservabilitySnapshot): ObservabilityDetailPanelViewModel {
  const io = snapshot.clusterIo
  const timing = io.timing
  return {
    ariaLabel: 'PostgreSQL I/O',
    eyebrow: 'PostgreSQL pg_stat_io',
    metrics: [
      { detail: formatBytes(io.readOperationBytes), label: 'Physical reads', value: formatCounter(io.reads) },
      { detail: formatBytes(io.writeOperationBytes), label: 'Writes', value: formatCounter(io.writes) },
      { detail: 'Shared-buffer hits', label: 'Cache hits', value: formatCounter(io.hits) },
      { detail: 'Buffers removed', label: 'Evictions', value: formatCounter(io.evictions) },
      { detail: `${formatCounter(io.extends)} extends`, label: 'Writebacks', value: formatCounter(io.writebacks) },
      { detail: `${formatCounter(io.reuses)} buffer reuses`, label: 'Fsyncs', value: formatCounter(io.fsyncs) },
    ],
    note: timing.status === 'available'
      ? `Cumulative timing: reads ${formatDuration(timing.data.readTimeMs)} · writes ${formatDuration(timing.data.writeTimeMs)} · fsync ${formatDuration(timing.data.fsyncTimeMs)}`
      : 'I/O operation counts are available; enable track_io_timing for cumulative timing.',
    title: 'Cluster I/O',
  }
}

function mysqlDetail(snapshot: MysqlObservabilitySnapshot): ObservabilityDetailPanelViewModel {
  const status = snapshot.serverStatus
  return {
    ariaLabel: 'MySQL server status',
    eyebrow: 'MySQL native global status',
    metrics: [
      { detail: 'Currently executing', label: 'Threads running', value: String(status.threadsRunning) },
      { detail: 'Client statements', label: 'Questions', value: formatCounter(status.questions) },
      { detail: 'Server statements', label: 'Queries', value: formatCounter(status.queries) },
      { detail: 'Long-query threshold', label: 'Slow queries', value: formatCounter(status.slowQueries) },
      { detail: 'Failed connection attempts', label: 'Aborted connects', value: formatCounter(status.abortedConnects) },
      { detail: formatBytes(status.bytesSent), label: 'Network received', value: formatBytes(status.bytesReceived) },
      { detail: 'Created on disk', label: 'Temporary tables', value: formatCounter(status.createdTemporaryDiskTables) },
      { detail: 'Accepted attempts', label: 'Connections since start', value: formatCounter(status.connections) },
    ],
    note: 'Cumulative server counters are not host CPU, RAM, or per-second rates.',
    title: 'Server workload',
  }
}

function trackingNotes(snapshot: ObservabilitySnapshot): readonly string[] {
  if (snapshot.engine === 'mysql') {
    return [
      snapshot.tracking.activities ? 'Performance Schema activity available' : 'Performance Schema activity unavailable',
      'MySQL global status counters',
      `Expected collection lag up to ${formatDuration(snapshot.collectionLagHintMs)}`,
    ]
  }
  return [
    snapshot.tracking.activities ? 'Activity tracking on' : 'Activity tracking off',
    snapshot.tracking.counts ? 'Database counters on' : 'Database counters off',
    snapshot.tracking.ioTiming ? 'I/O timing on' : 'I/O timing off',
    `Expected collection lag up to ${formatDuration(snapshot.collectionLagHintMs)}`,
  ]
}

export function buildObservabilityPanelModel(source: ObservabilityPanelSource): ObservabilityPanelModel {
  const snapshot = source.snapshot
  const engine = snapshot?.engine ?? source.engine ?? 'postgresql'
  const engineName = enginePresentation(engine).displayName
  return {
    databaseTable: snapshot
      ? snapshot.engine === 'mysql' ? mysqlDatabaseTable(snapshot) : postgresDatabaseTable(snapshot)
      : { caption: '', columns: [], emptyMessage: '', note: '', rows: [] },
    detailPanel: snapshot
      ? snapshot.engine === 'mysql' ? mysqlDetail(snapshot) : postgresDetail(snapshot)
      : { ariaLabel: '', eyebrow: '', metrics: [], note: '', title: '' },
    error: source.error,
    hostTelemetryMessage: `Host CPU and RAM are outside ${engineName} database telemetry and require an external metrics provider.`,
    loadAriaLabel: `${engineName} load`,
    loadingLabel: `Collecting ${engineName} statistics`,
    metrics: snapshot ? buildMetrics(snapshot) : [],
    refreshing: Boolean(snapshot && source.pending),
    sampledAtLabel: snapshot ? `${new Date(snapshot.sampledAt).toISOString().slice(0, 19).replace('T', ' ')} UTC` : null,
    sectionAriaLabel: `${engineName} observability`,
    serverMode: snapshot
      ? `${snapshot.engine === 'postgresql' ? snapshot.inRecovery ? 'Replica' : 'Primary' : snapshot.readOnlyServer ? 'Read-only server' : 'Writable server'} · uptime ${formatDuration(Date.parse(snapshot.sampledAt) - Date.parse(snapshot.serverStartedAt))}`
      : null,
    state: snapshot ? 'ready' : source.pending ? 'loading' : source.error ? 'error' : 'idle',
    trackingNotes: snapshot ? trackingNotes(snapshot) : [],
  }
}
