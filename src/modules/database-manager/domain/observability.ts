import type { EngineId } from './contracts'

export type DecimalCounter = string

export type MetricUnavailableReason =
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

export interface ObservabilitySnapshot {
  activity: MetricAvailability<ActivityMetrics>
  clusterIo: ClusterIoCounters
  collectionLagHintMs: number
  connections: ConnectionCapacityMetrics
  currentDatabase: string
  databases: readonly DatabaseMetricCounters[]
  engine: EngineId
  hostTelemetry: {
    reason: 'external-provider-required'
    status: 'unavailable'
  }
  inRecovery: boolean
  longQueryThresholdMs: number
  sampledAt: string
  scope: 'cluster'
  serverStartedAt: string
  source: 'postgresql-statistics'
  tracking: {
    activities: boolean
    counts: boolean
    ioTiming: boolean
  }
}
