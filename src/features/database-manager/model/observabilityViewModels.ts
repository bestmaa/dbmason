import type { ObservabilitySnapshot } from '@/modules/database-manager/domain/observability'

export type ObservabilityPanelState = 'error' | 'idle' | 'loading' | 'ready'

export interface ObservabilityMetricViewModel {
  detail: string
  label: string
  tone: 'danger' | 'neutral' | 'warning'
  value: string
}

export interface ObservabilityDatabaseRowViewModel {
  cacheHit: string
  connections: string
  database: string
  deadlocks: string
  size: string
  temporaryData: string
  transactions: string
}

export interface ObservabilityIoViewModel {
  detail: string
  label: string
  value: string
}

export interface ObservabilityPanelModel {
  databaseRows: readonly ObservabilityDatabaseRowViewModel[]
  error: string | null
  hostTelemetryMessage: string
  ioMetrics: readonly ObservabilityIoViewModel[]
  ioNote: string
  metrics: readonly ObservabilityMetricViewModel[]
  refreshing: boolean
  sampledAtLabel: string | null
  serverMode: string | null
  state: ObservabilityPanelState
  trackingNotes: readonly string[]
}

export interface ObservabilityPanelActions {
  refresh: () => void
}

interface ObservabilityPanelSource {
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

function unavailableActivityDetail(
  reason: 'remote-stats-privilege-required' | 'tracking-disabled',
) {
  return reason === 'tracking-disabled'
    ? 'PostgreSQL activity tracking is disabled.'
    : 'Grant pg_read_all_stats for cluster activity.'
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
    const detail = unavailableActivityDetail(snapshot.activity.reason)
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
    {
      detail: `${activity.idle} idle · ${activity.idleInTransaction} idle in transaction`,
      label: 'Active sessions',
      tone: 'neutral',
      value: String(activity.active),
    },
    {
      detail: 'Sessions blocked by a lock',
      label: 'Blocked',
      tone: activity.blocked > 0 ? 'danger' : 'neutral',
      value: String(activity.blocked),
    },
    {
      detail: 'Sessions waiting on PostgreSQL',
      label: 'Waiting',
      tone: activity.waiting > 0 ? 'warning' : 'neutral',
      value: String(activity.waiting),
    },
    {
      detail: `Threshold ${formatDuration(snapshot.longQueryThresholdMs)}`,
      label: 'Long-running',
      tone: activity.longRunning > 0 ? 'warning' : 'neutral',
      value: String(activity.longRunning),
    },
  ]
}

function databaseRow(
  database: ObservabilitySnapshot['databases'][number],
): ObservabilityDatabaseRowViewModel {
  const commits = formatCounter(database.transactionsCommitted)
  const rollbacks = formatCounter(database.transactionsRolledBack)
  return {
    cacheHit:
      database.bufferCacheHitPercent === null
        ? 'No reads yet'
        : `${database.bufferCacheHitPercent.toFixed(1)}%`,
    connections: String(database.currentConnections),
    database: database.database,
    deadlocks: formatCounter(database.deadlocks),
    size: formatBytes(database.sizeBytes),
    temporaryData: `${formatBytes(database.temporaryBytes)} · ${formatCounter(database.temporaryFiles)} files`,
    transactions: `${commits} / ${rollbacks}`,
  }
}

function trackingNotes(snapshot: ObservabilitySnapshot): readonly string[] {
  return [
    snapshot.tracking.activities ? 'Activity tracking on' : 'Activity tracking off',
    snapshot.tracking.counts ? 'Database counters on' : 'Database counters off',
    snapshot.tracking.ioTiming ? 'I/O timing on' : 'I/O timing off',
    `Expected collection lag up to ${formatDuration(snapshot.collectionLagHintMs)}`,
  ]
}

function buildIoMetrics(snapshot: ObservabilitySnapshot): readonly ObservabilityIoViewModel[] {
  const io = snapshot.clusterIo
  return [
    {
      detail: formatBytes(io.readOperationBytes),
      label: 'Physical reads',
      value: formatCounter(io.reads),
    },
    {
      detail: formatBytes(io.writeOperationBytes),
      label: 'Writes',
      value: formatCounter(io.writes),
    },
    { detail: 'Shared-buffer hits', label: 'Cache hits', value: formatCounter(io.hits) },
    { detail: 'Buffers removed', label: 'Evictions', value: formatCounter(io.evictions) },
    {
      detail: `${formatCounter(io.extends)} extends`,
      label: 'Writebacks',
      value: formatCounter(io.writebacks),
    },
    {
      detail: `${formatCounter(io.reuses)} buffer reuses`,
      label: 'Fsyncs',
      value: formatCounter(io.fsyncs),
    },
  ]
}

function ioNote(snapshot: ObservabilitySnapshot): string {
  const timing = snapshot.clusterIo.timing
  if (timing.status === 'unavailable') {
    return 'I/O operation counts are available; enable track_io_timing for cumulative timing.'
  }
  return `Cumulative timing: reads ${formatDuration(timing.data.readTimeMs)} · writes ${formatDuration(
    timing.data.writeTimeMs,
  )} · fsync ${formatDuration(timing.data.fsyncTimeMs)}`
}

export function buildObservabilityPanelModel(
  source: ObservabilityPanelSource,
): ObservabilityPanelModel {
  const snapshot = source.snapshot
  const state: ObservabilityPanelState = snapshot
    ? 'ready'
    : source.pending
      ? 'loading'
      : source.error
        ? 'error'
        : 'idle'

  return {
    databaseRows: snapshot?.databases.map(databaseRow) ?? [],
    error: source.error,
    hostTelemetryMessage:
      'Host CPU and RAM require an external metrics provider. PostgreSQL core does not expose reliable host utilization.',
    ioMetrics: snapshot ? buildIoMetrics(snapshot) : [],
    ioNote: snapshot ? ioNote(snapshot) : '',
    metrics: snapshot ? buildMetrics(snapshot) : [],
    refreshing: Boolean(snapshot && source.pending),
    sampledAtLabel: snapshot
      ? `${new Date(snapshot.sampledAt).toISOString().slice(0, 19).replace('T', ' ')} UTC`
      : null,
    serverMode: snapshot
      ? `${snapshot.inRecovery ? 'Replica' : 'Primary'} · uptime ${formatDuration(
          Date.parse(snapshot.sampledAt) - Date.parse(snapshot.serverStartedAt),
        )}`
      : null,
    state,
    trackingNotes: snapshot ? trackingNotes(snapshot) : [],
  }
}
