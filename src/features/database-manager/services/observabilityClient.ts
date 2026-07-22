import { z } from 'zod'

import { engineIds } from '@/modules/database-manager/domain/contracts'
import type {
  MetricAvailability,
  ObservabilitySnapshot,
} from '@/modules/database-manager/domain/observability'

import { requestJson } from './managerHttpClient'

const decimalCounterSchema = z.string().regex(/^\d+$/u)
const unavailableReasonSchema = z.enum([
  'performance-schema-disabled',
  'remote-stats-privilege-required',
  'tracking-disabled',
])

function metricAvailabilitySchema<T>(data: z.ZodType<T>): z.ZodType<MetricAvailability<T>> {
  return z.discriminatedUnion('status', [
    z.object({ data, status: z.literal('available') }),
    z.object({ reason: unavailableReasonSchema, status: z.literal('unavailable') }),
  ])
}

const activitySchema = z.object({
  active: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  idle: z.number().int().nonnegative(),
  idleInTransaction: z.number().int().nonnegative(),
  longRunning: z.number().int().nonnegative(),
  waiting: z.number().int().nonnegative(),
})

const ioTimingSchema = z.object({
  extendTimeMs: z.number().nonnegative(),
  fsyncTimeMs: z.number().nonnegative(),
  readTimeMs: z.number().nonnegative(),
  writeTimeMs: z.number().nonnegative(),
  writebackTimeMs: z.number().nonnegative(),
})

const commonShape = {
  activity: metricAvailabilitySchema(activitySchema),
  collectionLagHintMs: z.number().int().nonnegative(),
  connections: z.object({
    configuredMaximum: z.number().int().nonnegative(),
    observed: z.number().int().nonnegative(),
    regularCapacity: z.number().int().nonnegative(),
    reserved: z.number().int().nonnegative(),
    superuserReserved: z.number().int().nonnegative(),
    utilizationPercent: z.number().nonnegative(),
  }),
  currentDatabase: z.string(),
  hostTelemetry: z.object({
    reason: z.literal('external-provider-required'),
    status: z.literal('unavailable'),
  }),
  longQueryThresholdMs: z.number().int().nonnegative(),
  sampledAt: z.string().datetime(),
  serverStartedAt: z.string().datetime(),
  tracking: z.object({
    activities: z.boolean(),
    counts: z.boolean(),
    ioTiming: z.boolean(),
  }),
}

const postgresDatabaseMetricSchema = z.object({
  activeTimeMs: z.number().nonnegative(),
  blocksRead: decimalCounterSchema,
  bufferCacheHitPercent: z.number().min(0).max(100).nullable(),
  bufferHits: decimalCounterSchema,
  checksumFailures: decimalCounterSchema.nullable(),
  checksumLastFailureAt: z.string().datetime().nullable(),
  currentConnections: z.number().int().nonnegative(),
  database: z.string(),
  deadlocks: decimalCounterSchema,
  idleInTransactionTimeMs: z.number().nonnegative(),
  recoveryConflicts: decimalCounterSchema,
  sessions: decimalCounterSchema,
  sessionsAbandoned: decimalCounterSchema,
  sessionsFatal: decimalCounterSchema,
  sessionsKilled: decimalCounterSchema,
  sizeBytes: decimalCounterSchema.nullable(),
  statsResetAt: z.string().datetime().nullable(),
  temporaryBytes: decimalCounterSchema,
  temporaryFiles: decimalCounterSchema,
  transactionsCommitted: decimalCounterSchema,
  transactionsRolledBack: decimalCounterSchema,
})

const postgresSnapshotSchema = z.object({
  ...commonShape,
  clusterIo: z.object({
    evictions: decimalCounterSchema,
    extends: decimalCounterSchema,
    fsyncs: decimalCounterSchema,
    hits: decimalCounterSchema,
    readOperationBytes: decimalCounterSchema,
    reads: decimalCounterSchema,
    reuses: decimalCounterSchema,
    statsResetAt: z.string().datetime().nullable(),
    timing: metricAvailabilitySchema(ioTimingSchema),
    writeOperationBytes: decimalCounterSchema,
    writebacks: decimalCounterSchema,
    writes: decimalCounterSchema,
  }),
  databases: z.array(postgresDatabaseMetricSchema),
  engine: z.literal(engineIds[0]),
  inRecovery: z.boolean(),
  scope: z.literal('cluster'),
  source: z.literal('postgresql-statistics'),
})

const mysqlSnapshotSchema = z.object({
  ...commonShape,
  databases: z.array(z.object({
    currentConnections: z.number().int().nonnegative().nullable(),
    database: z.string(),
    defaultCharacterSet: z.string(),
    defaultCollation: z.string(),
    sizeBytes: decimalCounterSchema.nullable(),
  })),
  engine: z.literal(engineIds[1]),
  readOnlyServer: z.boolean(),
  scope: z.literal('server'),
  serverStatus: z.object({
    abortedConnects: decimalCounterSchema,
    bytesReceived: decimalCounterSchema,
    bytesSent: decimalCounterSchema,
    connections: decimalCounterSchema,
    createdTemporaryDiskTables: decimalCounterSchema,
    queries: decimalCounterSchema,
    questions: decimalCounterSchema,
    slowQueries: decimalCounterSchema,
    threadsRunning: z.number().int().nonnegative(),
  }),
  source: z.literal('mysql-server-status'),
})

const observabilitySnapshotSchema: z.ZodType<ObservabilitySnapshot> = z.discriminatedUnion(
  'engine',
  [postgresSnapshotSchema, mysqlSnapshotSchema],
)

export const observabilityClient = {
  getSnapshot(connectionId: string, signal?: AbortSignal): Promise<ObservabilitySnapshot> {
    const id = encodeURIComponent(connectionId)
    return requestJson(
      `/api/db-manager/v1/connections/${id}/observability`,
      observabilitySnapshotSchema,
      { signal: signal ?? null },
    )
  },
}
