import { z } from 'zod'

import type {
  MetricAvailability,
  ObservabilitySnapshot,
} from '@/modules/database-manager/domain/observability'

import { requestJson } from './managerHttpClient'

const decimalCounterSchema = z.string().regex(/^\d+$/u)
const unavailableReasonSchema = z.enum([
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

const databaseMetricSchema = z.object({
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

const observabilitySnapshotSchema: z.ZodType<ObservabilitySnapshot> = z.object({
  activity: metricAvailabilitySchema(activitySchema),
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
  databases: z.array(databaseMetricSchema),
  engine: z.literal('postgresql'),
  hostTelemetry: z.object({
    reason: z.literal('external-provider-required'),
    status: z.literal('unavailable'),
  }),
  inRecovery: z.boolean(),
  longQueryThresholdMs: z.number().int().nonnegative(),
  sampledAt: z.string().datetime(),
  scope: z.literal('cluster'),
  serverStartedAt: z.string().datetime(),
  source: z.literal('postgresql-statistics'),
  tracking: z.object({
    activities: z.boolean(),
    counts: z.boolean(),
    ioTiming: z.boolean(),
  }),
})

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
