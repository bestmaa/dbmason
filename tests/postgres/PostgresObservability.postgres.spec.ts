import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { DatabaseConnectionConfig } from '@/modules/database-manager/domain/contracts'
import { quoteIdentifier } from '@/modules/database-manager/infrastructure/postgresql/identifiers'
import { PostgresEngine } from '@/modules/database-manager/infrastructure/postgresql/PostgresEngine'

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}. Start the isolated PostgreSQL test harness.`)
  return value
}

const host = requiredEnv('POSTGRES_TEST_HOST')
const maintenanceDatabase = requiredEnv('POSTGRES_TEST_DATABASE')
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  throw new Error('PostgreSQL integration tests only run against a loopback host')
}
if (!maintenanceDatabase.toLowerCase().includes('test')) {
  throw new Error('POSTGRES_TEST_DATABASE must be an explicitly named test database')
}

const adminConfig: DatabaseConnectionConfig = {
  database: maintenanceDatabase,
  host,
  password: requiredEnv('POSTGRES_TEST_PASSWORD'),
  port: Number(requiredEnv('POSTGRES_TEST_PORT')),
  sslMode: 'disable',
  username: requiredEnv('POSTGRES_TEST_USER'),
}
const suffix = `${process.pid}_${Date.now().toString(36)}`
const database = `dbc_metrics_${suffix}`
const restrictedRole = `dbc_metrics_role_${suffix}`
const engine = new PostgresEngine()
let restrictedPassword = ''

function clientConfig(config: DatabaseConnectionConfig, applicationName: string) {
  return {
    application_name: applicationName,
    connectionTimeoutMillis: 5_000,
    database: config.database,
    host: config.host,
    password: config.password,
    port: config.port,
    query_timeout: 10_000,
    statement_timeout: 10_000,
    user: config.username,
  }
}

async function cleanup(): Promise<void> {
  const client = new Client(clientConfig(adminConfig, 'db-control-observability-cleanup'))
  try {
    await client.connect()
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`)
    await client.query(`DROP ROLE IF EXISTS ${quoteIdentifier(restrictedRole)}`)
  } finally {
    await client.end().catch(() => undefined)
  }
}

describe.sequential('PostgreSQL 17 aggregate observability', () => {
  beforeAll(async () => {
    await cleanup()
    await engine.createDatabase(adminConfig, { name: database, owner: null })
    restrictedPassword = (
      await engine.createPrincipal(adminConfig, {
        access: [{ database, level: 'connect' }],
        name: restrictedRole,
      })
    ).oneTimePassword
  })

  afterAll(cleanup)

  it('returns precise counters, capacity, I/O and an honest host boundary', async () => {
    const snapshot = await engine.getObservability({ ...adminConfig, database })
    const databaseMetrics = snapshot.databases.find((item) => item.database === database)

    expect(snapshot).toMatchObject({
      engine: 'postgresql',
      hostTelemetry: { reason: 'external-provider-required', status: 'unavailable' },
      scope: 'cluster',
      source: 'postgresql-statistics',
    })
    expect(snapshot.sampledAt).toMatch(/Z$/u)
    expect(snapshot.serverStartedAt).toMatch(/Z$/u)
    expect(snapshot.connections.configuredMaximum).toBeGreaterThan(0)
    expect(snapshot.connections.regularCapacity).toBeLessThanOrEqual(
      snapshot.connections.configuredMaximum,
    )
    expect(databaseMetrics).toBeDefined()
    expect(databaseMetrics?.currentConnections).toBe(0)
    expect(databaseMetrics?.transactionsCommitted).toMatch(/^\d+$/u)
    expect(databaseMetrics?.sizeBytes).toMatch(/^\d+$/u)
    expect(snapshot.clusterIo.reads).toMatch(/^\d+$/u)
    expect(snapshot.clusterIo.readOperationBytes).toMatch(/^\d+$/u)
    expect(snapshot.activity.status).toBe('available')
    expect(snapshot.clusterIo.timing.status).toBe(
      snapshot.tracking.ioTiming ? 'available' : 'unavailable',
    )
  })

  it('counts real workload while excluding its own sampler connection', async () => {
    const workload = new Client(
      clientConfig({ ...adminConfig, database }, 'db-control-observability-workload'),
    )
    await workload.connect()
    const running = workload.query('SELECT pg_sleep(5)')
    await new Promise((resolve) => setTimeout(resolve, 100))

    try {
      const snapshot = await engine.getObservability({ ...adminConfig, database })
      const databaseMetrics = snapshot.databases.find((item) => item.database === database)

      expect(databaseMetrics?.currentConnections).toBe(1)
      expect(snapshot.activity).toMatchObject({
        data: { active: expect.any(Number) },
        status: 'available',
      })
      if (snapshot.activity.status === 'available') {
        expect(snapshot.activity.data.active).toBeGreaterThanOrEqual(1)
      }
    } finally {
      await running
      await workload.end().catch(() => undefined)
    }
  })

  it('returns unavailable activity instead of partial data for an ordinary role', async () => {
    const restrictedConfig: DatabaseConnectionConfig = {
      ...adminConfig,
      database,
      password: restrictedPassword,
      username: restrictedRole,
    }
    const snapshot = await engine.getObservability(restrictedConfig)

    expect(snapshot.activity).toEqual({
      reason: 'remote-stats-privilege-required',
      status: 'unavailable',
    })
    expect(snapshot.databases.find((item) => item.database === database)?.sizeBytes).toMatch(
      /^\d+$/u,
    )
  })
})
