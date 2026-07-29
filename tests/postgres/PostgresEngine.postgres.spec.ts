import { Client } from 'pg'
import type { QueryResultRow } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { DatabaseConnectionConfig } from '@/modules/database-manager/domain/contracts'
import { quoteIdentifier } from '@/modules/database-manager/infrastructure/postgresql/identifiers'
import { PostgresEngine } from '@/modules/database-manager/infrastructure/postgresql/PostgresEngine'

interface PasswordRow extends QueryResultRow {
  password: string | null
}

interface PrivilegeRow extends QueryResultRow {
  canConnect: boolean
}

interface OidRow extends QueryResultRow {
  oid: number
}

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
  database: `dbc_it_${suffix}`,
  developerRole: `dbc_developer_${suffix}`,
  outsideDatabase: `dbc_outside_${suffix}`,
  readRole: `dbc_read_${suffix}`,
  writeRole: `dbc_write_${suffix}`,
  connectRole: `dbc_connect_${suffix}`,
  failedRole: `dbc_failed_${suffix}`,
  inheritedRole: `dbc_inherited_${suffix}`,
  potentialPrivilegeRole: `dbc_potential_privilege_${suffix}`,
  potentialProbe: `dbc_potential_probe_${suffix}`,
  potentialSwitchRole: `dbc_potential_switch_${suffix}`,
}
const engine = new PostgresEngine()
const credentials: Record<'connect' | 'read' | 'write', string> = {
  connect: '',
  read: '',
  write: '',
}

function clientConfig(database: string, user: string, password: string) {
  return {
    connectionTimeoutMillis: 5_000,
    database,
    host: adminConfig.host,
    password,
    port: adminConfig.port,
    query_timeout: 10_000,
    statement_timeout: 10_000,
    user,
  }
}

async function withClient<T>(
  database: string,
  user: string,
  password: string,
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(clientConfig(database, user, password))
  try {
    await client.connect()
    return await operation(client)
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function adminSql(database: string, statement: string): Promise<void> {
  await withClient(database, adminConfig.username, adminConfig.password, async (client) => {
    await client.query(statement)
  })
}

async function dropTestResources(): Promise<void> {
  await withClient(
    maintenanceDatabase,
    adminConfig.username,
    adminConfig.password,
    async (client) => {
      for (const database of [names.database, names.outsideDatabase]) {
        await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`)
      }
      for (const role of [
        names.inheritedRole,
        names.readRole,
        names.writeRole,
        names.developerRole,
        names.connectRole,
        names.failedRole,
        names.potentialProbe,
        names.potentialSwitchRole,
        names.potentialPrivilegeRole,
      ]) {
        await client.query(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`)
      }
    },
  )
}

describe('PostgresEngine against the isolated PostgreSQL harness', () => {
  beforeAll(async () => {
    await dropTestResources()
    await engine.createDatabase(adminConfig, { name: names.database, owner: null })
    await engine.createDatabase(adminConfig, { name: names.outsideDatabase, owner: null })
    await adminSql(
      names.database,
      'CREATE TABLE public.existing_items (id integer GENERATED ALWAYS AS IDENTITY, label text)',
    )
    await adminSql(names.database, "INSERT INTO public.existing_items (label) VALUES ('seed')")

    credentials.read = (
      await engine.createPrincipal(adminConfig, {
        access: [{ database: names.database, level: 'read' }],
        name: names.readRole,
      })
    ).oneTimePassword
    credentials.write = (
      await engine.createPrincipal(adminConfig, {
        access: [{ database: names.database, level: 'write' }],
        name: names.writeRole,
      })
    ).oneTimePassword
    credentials.connect = (
      await engine.createPrincipal(adminConfig, {
        access: [{ database: names.database, level: 'connect' }],
        name: names.connectRole,
      })
    ).oneTimePassword
    await engine.createPrincipal(adminConfig, {
      access: [{ database: names.database, level: 'developer' }],
      name: names.developerRole,
    })
    await engine.createPrincipal(adminConfig, { access: [], name: names.inheritedRole })
    await engine.createPrincipal(adminConfig, {
      access: [{ database: names.database, level: 'connect' }],
      name: names.potentialProbe,
    })
    await adminSql(
      maintenanceDatabase,
      `CREATE ROLE ${quoteIdentifier(names.potentialSwitchRole)} NOLOGIN`,
    )
    await adminSql(
      maintenanceDatabase,
      `CREATE ROLE ${quoteIdentifier(names.potentialPrivilegeRole)} NOLOGIN`,
    )
    await adminSql(
      maintenanceDatabase,
      `GRANT ${quoteIdentifier(names.potentialSwitchRole)}
        TO ${quoteIdentifier(names.potentialProbe)} WITH INHERIT FALSE, SET TRUE`,
    )
    await adminSql(
      maintenanceDatabase,
      `GRANT ${quoteIdentifier(names.potentialPrivilegeRole)}
        TO ${quoteIdentifier(names.potentialSwitchRole)} WITH INHERIT TRUE, SET FALSE`,
    )
    await adminSql(
      maintenanceDatabase,
      `GRANT CREATE ON DATABASE ${quoteIdentifier(names.database)}
        TO ${quoteIdentifier(names.potentialPrivilegeRole)}`,
    )
    await adminSql(
      maintenanceDatabase,
      `GRANT ${quoteIdentifier(names.readRole)} TO ${quoteIdentifier(names.inheritedRole)}`,
    )

    await adminSql(
      names.database,
      'CREATE TABLE public.future_items (id integer GENERATED ALWAYS AS IDENTITY, label text)',
    )
    await adminSql(names.database, "INSERT INTO public.future_items (label) VALUES ('future')")
  })

  afterAll(dropTestResources)

  it('creates login roles with SCRAM verifiers while returning usable one-time passwords', async () => {
    await withClient(names.database, names.readRole, credentials.read, async (client) => {
      const result = await client.query<{ currentUser: string }>(
        'SELECT current_user AS "currentUser"',
      )
      expect(result.rows[0]?.currentUser).toBe(names.readRole)
    })

    await withClient(
      maintenanceDatabase,
      adminConfig.username,
      adminConfig.password,
      async (client) => {
        const result = await client.query<PasswordRow>(
          'SELECT rolpassword AS password FROM pg_authid WHERE rolname = $1',
          [names.readRole],
        )
        const storedPassword = result.rows[0]?.password
        expect(storedPassword).toMatch(/^SCRAM-SHA-256\$4096:/u)
        expect(storedPassword).not.toContain(credentials.read)
      },
    )
  })

  it('enforces read-only access on existing and future tables', async () => {
    await withClient(names.database, names.readRole, credentials.read, async (client) => {
      await expect(client.query('SELECT * FROM public.existing_items')).resolves.toBeDefined()
      await expect(client.query('SELECT * FROM public.future_items')).resolves.toBeDefined()
      await expect(
        client.query("INSERT INTO public.existing_items (label) VALUES ('denied')"),
      ).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('allows write access on existing and future tables without role administration', async () => {
    await withClient(names.database, names.writeRole, credentials.write, async (client) => {
      await expect(
        client.query("INSERT INTO public.existing_items (label) VALUES ('written')"),
      ).resolves.toBeDefined()
      await expect(
        client.query("INSERT INTO public.future_items (label) VALUES ('future-written')"),
      ).resolves.toBeDefined()
      await expect(
        client.query(`CREATE ROLE ${quoteIdentifier(`denied_${suffix}`)}`),
      ).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('keeps connect-only roles away from managed tables', async () => {
    await withClient(names.database, names.connectRole, credentials.connect, async (client) => {
      await expect(client.query('SELECT 1')).resolves.toBeDefined()
      await expect(client.query('SELECT * FROM public.existing_items')).rejects.toMatchObject({
        code: '42501',
      })
    })
  })

  it('reports PostgreSQL PUBLIC CONNECT as additive access, not exclusive isolation', async () => {
    const snapshot = await engine.getSnapshot(adminConfig)
    const outsideDatabase = snapshot.databases.find(({ name }) => name === names.outsideDatabase)
    expect(outsideDatabase).toMatchObject({ publicConnect: true, publicTemporary: true })

    await withClient(
      maintenanceDatabase,
      adminConfig.username,
      adminConfig.password,
      async (client) => {
        const result = await client.query<PrivilegeRow>(
          'SELECT has_database_privilege($1, $2, \'CONNECT\') AS "canConnect"',
          [names.readRole, names.outsideDatabase],
        )
        expect(result.rows[0]?.canConnect).toBe(true)
      },
    )
    await expect(
      withClient(names.outsideDatabase, names.readRole, credentials.read, async (client) => {
        await client.query('SELECT 1')
      }),
    ).resolves.toBeUndefined()
  })

  it('reports live direct presets separately from effective PUBLIC access', async () => {
    const readInventory = await engine.getPrincipalAccess(adminConfig, names.readRole)
    expect(
      readInventory.databases.find(({ database }) => database === names.database),
    ).toMatchObject({
      directPreset: 'read',
      effectivePreset: 'custom',
      sources: expect.arrayContaining(['direct', 'public']),
    })
    expect(
      readInventory.databases.find(({ database }) => database === names.outsideDatabase),
    ).toMatchObject({
      directPreset: 'none',
      effectivePreset: 'custom',
      sources: ['public'],
    })

    const writeInventory = await engine.getPrincipalAccess(adminConfig, names.writeRole)
    expect(
      writeInventory.databases.find(({ database }) => database === names.database),
    ).toMatchObject({ directPreset: 'write', effectivePreset: 'custom' })

    const connectInventory = await engine.getPrincipalAccess(adminConfig, names.connectRole)
    expect(
      connectInventory.databases.find(({ database }) => database === names.database),
    ).toMatchObject({ directPreset: 'connect', effectivePreset: 'custom' })

    const developerInventory = await engine.getPrincipalAccess(
      adminConfig,
      names.developerRole,
    )
    expect(
      developerInventory.databases.find(({ database }) => database === names.database),
    ).toMatchObject({ directPreset: 'developer', effectivePreset: 'custom' })

    const inheritedInventory = await engine.getPrincipalAccess(
      adminConfig,
      names.inheritedRole,
    )
    expect(
      inheritedInventory.databases.find(({ database }) => database === names.database),
    ).toMatchObject({
      directPreset: 'none',
      effectivePreset: 'custom',
      sources: expect.arrayContaining(['public', 'inherited']),
    })
    expect(
      inheritedInventory.databases.find(
        ({ database }) => database === names.outsideDatabase,
      )?.sources,
    ).not.toContain('inherited')
  })

  it('reports privileged attributes and SET-role chains as custom authority', async () => {
    await adminSql(
      maintenanceDatabase,
      `ALTER ROLE ${quoteIdentifier(names.connectRole)} BYPASSRLS`,
    )
    const privilegedInventory = await engine.getPrincipalAccess(
      adminConfig,
      names.connectRole,
    )
    expect(
      privilegedInventory.databases.find(({ database }) => database === names.database),
    ).toMatchObject({
      directPreset: 'custom',
      effectivePreset: 'custom',
      sources: expect.arrayContaining(['privileged']),
    })
    await adminSql(
      maintenanceDatabase,
      `ALTER ROLE ${quoteIdentifier(names.connectRole)} NOBYPASSRLS`,
    )

    const potentialInventory = await engine.getPrincipalAccess(
      adminConfig,
      names.potentialProbe,
    )
    expect(
      potentialInventory.databases.find(({ database }) => database === names.database),
    ).toMatchObject({
      directPreset: 'connect',
      potentialPreset: 'custom',
      sources: expect.arrayContaining(['direct', 'role-switch']),
    })
  })

  it('fails unmodelled large-object write authority to custom', async () => {
    await withClient(
      names.database,
      adminConfig.username,
      adminConfig.password,
      async (client) => {
        const result = await client.query<OidRow>('SELECT lo_create(0) AS oid')
        const oid = result.rows[0]?.oid
        if (!oid) throw new Error('PostgreSQL did not create the test large object')
        try {
          await client.query(
            `GRANT UPDATE ON LARGE OBJECT ${oid} TO ${quoteIdentifier(names.writeRole)}`,
          )
          const inventory = await engine.getPrincipalAccess(adminConfig, names.writeRole)
          expect(
            inventory.databases.find(({ database }) => database === names.database),
          ).toMatchObject({
            directPreset: 'custom',
            effectivePreset: 'custom',
            sources: expect.arrayContaining(['direct']),
          })
        } finally {
          await client.query('SELECT lo_unlink($1)', [oid])
        }
      },
    )
    const restored = await engine.getPrincipalAccess(adminConfig, names.writeRole)
    expect(
      restored.databases.find(({ database }) => database === names.database),
    ).toMatchObject({ directPreset: 'write' })
  })

  it('fails database grant options and private-schema authority to custom', async () => {
    await adminSql(
      maintenanceDatabase,
      `GRANT CONNECT ON DATABASE ${quoteIdentifier(names.database)}
        TO ${quoteIdentifier(names.connectRole)} WITH GRANT OPTION`,
    )
    const grantOptionInventory = await engine.getPrincipalAccess(
      adminConfig,
      names.connectRole,
    )
    expect(
      grantOptionInventory.databases.find(
        ({ database }) => database === names.database,
      ),
    ).toMatchObject({
      directPreset: 'custom',
      effectivePreset: 'custom',
      sources: expect.arrayContaining(['direct', 'public']),
    })
    await adminSql(
      maintenanceDatabase,
      `REVOKE GRANT OPTION FOR CONNECT ON DATABASE ${quoteIdentifier(names.database)}
        FROM ${quoteIdentifier(names.connectRole)}`,
    )

    await adminSql(names.database, 'CREATE SCHEMA private_inventory')
    await adminSql(
      names.database,
      'CREATE TABLE private_inventory.secret_items (id integer)',
    )
    await adminSql(
      names.database,
      `GRANT USAGE ON SCHEMA private_inventory TO ${quoteIdentifier(names.readRole)}`,
    )
    await adminSql(
      names.database,
      `GRANT SELECT ON private_inventory.secret_items TO ${quoteIdentifier(names.readRole)}`,
    )
    const privateInventory = await engine.getPrincipalAccess(adminConfig, names.readRole)
    expect(
      privateInventory.databases.find(({ database }) => database === names.database),
    ).toMatchObject({
      directPreset: 'custom',
      effectivePreset: 'custom',
      sources: expect.arrayContaining(['direct', 'public']),
    })
  })

  it('preflights missing databases before creating a role', async () => {
    await expect(
      engine.createPrincipal(adminConfig, {
        access: [{ database: `missing_${suffix}`, level: 'read' }],
        name: names.failedRole,
      }),
    ).rejects.toMatchObject({ code: 'DATABASE_NOT_FOUND', status: 404 })

    const snapshot = await engine.getSnapshot(adminConfig)
    expect(snapshot.principals.some(({ name }) => name === names.failedRole)).toBe(false)
  })
})
