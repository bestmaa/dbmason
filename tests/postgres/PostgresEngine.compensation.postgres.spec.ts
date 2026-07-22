import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { DatabaseConnectionConfig } from '@/modules/database-manager/domain/contracts'
import { quoteIdentifier } from '@/modules/database-manager/infrastructure/postgresql/identifiers'
import { PostgresEngine } from '@/modules/database-manager/infrastructure/postgresql/PostgresEngine'
import { createScramSha256Verifier } from '@/modules/database-manager/infrastructure/security/scramSha256Verifier'

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
const names = {
  accessFailedRole: `dbc_access_fail_${suffix}`,
  createFailedRole: `dbc_create_fail_${suffix}`,
  limitedAdmin: `dbc_limited_${suffix}`,
  ownedDatabase: `dbc_owned_${suffix}`,
  partialDatabase: `dbc_partial_${suffix}`,
}
const limitedPassword = 'TEST_ONLY_limited_admin_password_2026'
const engine = new PostgresEngine()
const limitedConfig: DatabaseConnectionConfig = {
  ...adminConfig,
  password: limitedPassword,
  username: names.limitedAdmin,
}
let accessFailedPassword = ''

async function withClient<T>(
  config: DatabaseConnectionConfig,
  database: string,
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionTimeoutMillis: 5_000,
    database,
    host: config.host,
    password: config.password,
    port: config.port,
    query_timeout: 10_000,
    statement_timeout: 10_000,
    user: config.username,
  })
  try {
    await client.connect()
    return await operation(client)
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function adminSql(database: string, statement: string): Promise<void> {
  await withClient(adminConfig, database, async (client) => {
    await client.query(statement)
  })
}

async function dropTestResources(): Promise<void> {
  await withClient(adminConfig, maintenanceDatabase, async (client) => {
    for (const database of [names.ownedDatabase, names.partialDatabase]) {
      await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`)
    }
    for (const role of [names.createFailedRole, names.accessFailedRole, names.limitedAdmin]) {
      await client.query(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`)
    }
  })
}

describe('PostgresEngine failure compensation', () => {
  beforeAll(async () => {
    await dropTestResources()
    const verifier = createScramSha256Verifier(limitedPassword)
    await adminSql(
      maintenanceDatabase,
      `CREATE ROLE ${quoteIdentifier(names.limitedAdmin)} LOGIN CREATEROLE PASSWORD '${verifier}'`,
    )
    await engine.createDatabase(adminConfig, {
      name: names.ownedDatabase,
      owner: names.limitedAdmin,
    })
    await engine.createDatabase(adminConfig, {
      name: names.partialDatabase,
      owner: null,
    })
    await adminSql(
      maintenanceDatabase,
      `GRANT CONNECT ON DATABASE ${quoteIdentifier(names.partialDatabase)} TO ${quoteIdentifier(names.limitedAdmin)}`,
    )
    await adminSql(
      names.partialDatabase,
      `REVOKE CONNECT ON DATABASE ${quoteIdentifier(names.partialDatabase)} FROM PUBLIC`,
    )
    await adminSql(names.partialDatabase, 'REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC')
    await adminSql(names.partialDatabase, 'CREATE TABLE public.admin_owned_items (id integer)')
    accessFailedPassword = (
      await engine.createPrincipal(adminConfig, { access: [], name: names.accessFailedRole })
    ).oneTimePassword
  })

  afterAll(dropTestResources)

  it('removes earlier grants and drops a newly created role when a later grant fails', async () => {
    await expect(
      engine.createPrincipal(limitedConfig, {
        access: [
          { database: names.ownedDatabase, level: 'read' },
          { database: names.partialDatabase, level: 'read' },
        ],
        name: names.createFailedRole,
      }),
    ).rejects.toMatchObject({ code: '42501' })

    const snapshot = await engine.getSnapshot(adminConfig)
    expect(snapshot.principals.some(({ name }) => name === names.createFailedRole)).toBe(false)
  })

  it('clears partial direct grants after access replacement fails and preserves the cause', async () => {
    await expect(
      engine.setPrincipalAccess(limitedConfig, {
        database: names.partialDatabase,
        level: 'read',
        principal: names.accessFailedRole,
      }),
    ).rejects.toMatchObject({ code: '42501' })

    await expect(
      withClient(
        { ...adminConfig, password: accessFailedPassword, username: names.accessFailedRole },
        names.partialDatabase,
        async (client) => client.query('SELECT 1'),
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })
})
