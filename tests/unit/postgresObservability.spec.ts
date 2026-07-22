import type { Client, QueryResultRow } from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseConnectionConfig } from '@/modules/database-manager/domain/contracts'

const withClientMock = vi.hoisted(() => vi.fn())

vi.mock('@/modules/database-manager/infrastructure/postgresql/postgresClient', () => ({
  withPostgresClient: withClientMock,
}))

import { getPostgresObservability } from '@/modules/database-manager/infrastructure/postgresql/PostgresObservability'

const config: DatabaseConnectionConfig = {
  database: 'observability_test',
  host: '127.0.0.1',
  password: 'test-only',
  port: 5432,
  sslMode: 'disable',
  username: 'test_admin',
}

function rows(...values: QueryResultRow[]): { rows: QueryResultRow[] } {
  return { rows: values }
}

function createQuery(options: { fullStats: boolean; ioTiming: boolean; metadataMissing?: boolean }) {
  return vi.fn(async (statement: unknown) => {
    if (typeof statement !== 'string') throw new Error('Expected a fixed SQL statement')
    if (statement.includes('pg_postmaster_start_time')) {
      if (options.metadataMissing) return rows()
      return rows({
        currentDatabase: 'observability_test',
        hasFullStatsAccess: options.fullStats,
        inRecovery: false,
        maxConnections: 100,
        reservedConnections: 2,
        sampledAt: '2026-07-20T12:00:00.000Z',
        serverStartedAt: '2026-07-20T10:00:00.000Z',
        superuserReservedConnections: 3,
        trackActivities: true,
        trackCounts: true,
        trackIoTiming: options.ioTiming,
      })
    }
    if (statement.includes('FROM pg_stat_database')) {
      return rows({
        activeTimeMs: 123.5,
        blocksRead: '8',
        bufferCacheHitPercent: 99.4,
        bufferHits: '992',
        checksumFailures: null,
        checksumLastFailureAt: null,
        currentConnections: 2,
        database: 'observability_test',
        deadlocks: '1',
        idleInTransactionTimeMs: 5,
        recoveryConflicts: '0',
        sessions: '9007199254740994',
        sessionsAbandoned: '0',
        sessionsFatal: '0',
        sessionsKilled: '0',
        sizeBytes: '32768',
        statsResetAt: null,
        temporaryBytes: '4096',
        temporaryFiles: '2',
        transactionsCommitted: '9007199254740993',
        transactionsRolledBack: '7',
      })
    }
    if (statement.includes('FROM pg_stat_io')) {
      return rows({
        evictions: '7',
        extendTimeMs: 1,
        extends: '8',
        fsyncs: '9',
        fsyncTimeMs: 2,
        hits: '10',
        readOperationBytes: '8192',
        reads: '1',
        readTimeMs: 3,
        reuses: '11',
        statsResetAt: '2026-07-20T10:00:00.000Z',
        writeOperationBytes: '16384',
        writeTimeMs: 4,
        writebackTimeMs: 5,
        writebacks: '12',
        writes: '2',
      })
    }
    if (statement.includes('FROM pg_stat_activity')) {
      return rows({ active: 2, blocked: 1, idle: 3, idleInTransaction: 1, longRunning: 1, waiting: 1 })
    }
    return rows()
  })
}

function useQuery(query: ReturnType<typeof createQuery>): void {
  const client = { query } as unknown as Client
  withClientMock.mockImplementation(async (...args: unknown[]) => {
    const operation = args.at(-1)
    if (typeof operation !== 'function') {
      throw new Error(
        `Expected a PostgreSQL client operation; received ${args.map((value) => typeof value).join(',')}`,
      )
    }
    return operation(client)
  })
}

describe('PostgreSQL aggregate observability', () => {
  beforeEach(() => {
    withClientMock.mockReset()
  })

  it('preserves large counters and never invents host or I/O timing metrics', async () => {
    const query = createQuery({ fullStats: true, ioTiming: false })
    useQuery(query)

    const snapshot = await getPostgresObservability(config)

    expect(snapshot.databases[0]?.transactionsCommitted).toBe('9007199254740993')
    expect(snapshot.connections).toEqual({
      configuredMaximum: 100,
      observed: 2,
      regularCapacity: 95,
      reserved: 2,
      superuserReserved: 3,
      utilizationPercent: 2,
    })
    expect(snapshot.activity).toMatchObject({ status: 'available', data: { active: 2 } })
    expect(snapshot.clusterIo.timing).toEqual({
      reason: 'tracking-disabled',
      status: 'unavailable',
    })
    expect(snapshot.hostTelemetry).toEqual({
      reason: 'external-provider-required',
      status: 'unavailable',
    })
    expect(query.mock.calls.map(([statement]) => statement)).toEqual(
      expect.arrayContaining(['BEGIN READ ONLY', 'COMMIT']),
    )
  })

  it('does not query restricted activity details without remote statistics access', async () => {
    const query = createQuery({ fullStats: false, ioTiming: true })
    useQuery(query)

    const snapshot = await getPostgresObservability(config)

    expect(snapshot.activity).toEqual({
      reason: 'remote-stats-privilege-required',
      status: 'unavailable',
    })
    expect(snapshot.clusterIo.timing.status).toBe('available')
    expect(
      query.mock.calls.some(
        ([statement]) => typeof statement === 'string' && statement.includes('pg_stat_activity'),
      ),
    ).toBe(false)
  })

  it('rolls back the read-only snapshot when a statistics query fails', async () => {
    const query = createQuery({ fullStats: true, ioTiming: true, metadataMissing: true })
    useQuery(query)

    await expect(getPostgresObservability(config)).rejects.toThrow(
      'PostgreSQL returned no observability metadata information',
    )
    expect(query).toHaveBeenCalledWith('ROLLBACK')
  })
})
