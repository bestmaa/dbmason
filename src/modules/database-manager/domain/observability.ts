import type { EngineId } from './contracts'

export type DecimalCounter = string

export type MetricUnavailableReason =
  | 'performance-schema-disabled'
  | 'remote-stats-privilege-required'
  | 'tracking-disabled'

export type MetricAvailability<T> =
  | { data: T; status: 'available' }
  | { reason: MetricUnavailableReason; status: 'unavailable' }

export interface ActivityMetrics {
  active: number
  blocked: number
  idle: number
  idleInTransaction: number
  longRunning: number
  waiting: number
}

export interface ConnectionCapacityMetrics {
  configuredMaximum: number
  observed: number
  regularCapacity: number
  reserved: number
  superuserReserved: number
  utilizationPercent: number
}

export interface DatabaseMetricCounters {
  activeTimeMs: number
  blocksRead: DecimalCounter
  bufferCacheHitPercent: number | null
  bufferHits: DecimalCounter
  checksumFailures: DecimalCounter | null
  checksumLastFailureAt: string | null
  currentConnections: number
  database: string
  deadlocks: DecimalCounter
  idleInTransactionTimeMs: number
  recoveryConflicts: DecimalCounter
  sessions: DecimalCounter
  sessionsAbandoned: DecimalCounter
  sessionsFatal: DecimalCounter
  sessionsKilled: DecimalCounter
  sizeBytes: DecimalCounter | null
  statsResetAt: string | null
  temporaryBytes: DecimalCounter
  temporaryFiles: DecimalCounter
  transactionsCommitted: DecimalCounter
  transactionsRolledBack: DecimalCounter
}

export interface IoTimingMetrics {
  extendTimeMs: number
  fsyncTimeMs: number
  readTimeMs: number
  writeTimeMs: number
  writebackTimeMs: number
}

export interface ClusterIoCounters {
  evictions: DecimalCounter
  extends: DecimalCounter
  fsyncs: DecimalCounter
  hits: DecimalCounter
  readOperationBytes: DecimalCounter
  reads: DecimalCounter
  reuses: DecimalCounter
  statsResetAt: string | null
  timing: MetricAvailability<IoTimingMetrics>
  writeOperationBytes: DecimalCounter
  writebacks: DecimalCounter
  writes: DecimalCounter
}

interface ObservabilitySnapshotBase {
  activity: MetricAvailability<ActivityMetrics>
  collectionLagHintMs: number
  connections: ConnectionCapacityMetrics
  currentDatabase: string
  engine: EngineId
  hostTelemetry: {
    reason: 'external-provider-required'
    status: 'unavailable'
  }
  longQueryThresholdMs: number
  sampledAt: string
  serverStartedAt: string
  tracking: {
    activities: boolean
    counts: boolean
    ioTiming: boolean
  }
}

export interface PostgresObservabilitySnapshot extends ObservabilitySnapshotBase {
  clusterIo: ClusterIoCounters
  databases: readonly DatabaseMetricCounters[]
  engine: 'postgresql'
  inRecovery: boolean
  scope: 'cluster'
  source: 'postgresql-statistics'
}

export interface MysqlDatabaseMetrics {
  currentConnections: number | null
  database: string
  defaultCharacterSet: string
  defaultCollation: string
  sizeBytes: DecimalCounter | null
}

export interface MysqlServerStatusCounters {
  abortedConnects: DecimalCounter
  bytesReceived: DecimalCounter
  bytesSent: DecimalCounter
  connections: DecimalCounter
  createdTemporaryDiskTables: DecimalCounter
  queries: DecimalCounter
  questions: DecimalCounter
  slowQueries: DecimalCounter
  threadsRunning: number
}

export interface MysqlObservabilitySnapshot extends ObservabilitySnapshotBase {
  databases: readonly MysqlDatabaseMetrics[]
  engine: 'mysql'
  readOnlyServer: boolean
  scope: 'server'
  serverStatus: MysqlServerStatusCounters
  source: 'mysql-server-status'
}

export type ObservabilitySnapshot = MysqlObservabilitySnapshot | PostgresObservabilitySnapshot
