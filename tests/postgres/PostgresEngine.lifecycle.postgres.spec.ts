import { Client } from 'pg'
import type { QueryResultRow } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { DatabaseConnectionConfig } from '@/modules/database-manager/domain/contracts'
import { ManagerError } from '@/modules/database-manager/domain/errors'
import { quoteIdentifier } from '@/modules/database-manager/infrastructure/postgresql/identifiers'
import { PostgresEngine } from '@/modules/database-manager/infrastructure/postgresql/PostgresEngine'

interface PasswordRow extends QueryResultRow {
  password: string | null
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
  createdb: `dbc_createdb_${suffix}`,
  createrole: `dbc_createrole_${suffix}`,
  database: `dbc_lifecycle_${suffix}`,
  inheritedChild: `dbc_inherited_child_${suffix}`,
  principal: `dbc_user_${suffix}`,
  setOnlyChild: `dbc_set_only_child_${suffix}`,
  superuser: `dbc_super_${suffix}`,
  unsafeParent: `dbc_unsafe_parent_${suffix}`,
}
const inheritedChildPassword = 'TEST_ONLY_lifecycle_inherited_child_2026'
const setOnlyChildPassword = 'TEST_ONLY_lifecycle_set_only_child_2026'
const engine = new PostgresEngine()
let currentPassword = ''

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
      await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(names.database)} WITH (FORCE)`)
      for (const role of [
        names.principal,
        names.inheritedChild,
        names.setOnlyChild,
        names.unsafeParent,
        names.createdb,
        names.createrole,
        names.superuser,
      ]) {
        await client.query(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`)
      }
    },
  )
}

describe('PostgresEngine principal lifecycle', () => {
  beforeAll(async () => {
    await dropTestResources()
    await engine.createDatabase(adminConfig, { name: names.database, owner: null })
    await adminSql(names.database, 'CREATE TABLE public.items (id integer, label text)')
    await adminSql(names.database, "INSERT INTO public.items VALUES (1, 'seed')")
    currentPassword = (
      await engine.createPrincipal(adminConfig, {
        access: [{ database: names.database, level: 'read' }],
        name: names.principal,
      })
    ).oneTimePassword
    await adminSql(
      maintenanceDatabase,
      `CREATE ROLE ${quoteIdentifier(names.createdb)} LOGIN CREATEDB`,
    )
    await adminSql(
      maintenanceDatabase,
      `CREATE ROLE ${quoteIdentifier(names.createrole)} LOGIN CREATEROLE`,
    )
    await adminSql(
      maintenanceDatabase,
      `CREATE ROLE ${quoteIdentifier(names.superuser)} LOGIN SUPERUSER`,
    )
    await adminSql(
      maintenanceDatabase,
      `CREATE ROLE ${quoteIdentifier(names.unsafeParent)} NOLOGIN CREATEDB`,
    )
    await adminSql(
      maintenanceDatabase,
      `CREATE ROLE ${quoteIdentifier(names.inheritedChild)} LOGIN
       PASSWORD '${inheritedChildPassword}'`,
    )
    await adminSql(
      maintenanceDatabase,
      `CREATE ROLE ${quoteIdentifier(names.setOnlyChild)} LOGIN
       PASSWORD '${setOnlyChildPassword}'`,
    )
    await adminSql(
      maintenanceDatabase,
      `GRANT ${quoteIdentifier(names.unsafeParent)} TO ${quoteIdentifier(names.inheritedChild)}`,
    )
    await adminSql(
      maintenanceDatabase,
      `GRANT ${quoteIdentifier(names.unsafeParent)} TO ${quoteIdentifier(names.setOnlyChild)}
       WITH INHERIT FALSE, SET TRUE`,
    )
  })

  afterAll(dropTestResources)

  it('supports prefer mode against the local non-TLS harness through its exact fallback', async () => {
    await expect(engine.testConnection({ ...adminConfig, sslMode: 'prefer' })).resolves.toEqual(
      expect.objectContaining({ serverVersion: expect.any(String) }),
    )
  })

  it('changes an existing role between allowlisted access presets', async () => {
    await engine.setPrincipalAccess(adminConfig, {
      database: names.database,
      level: 'write',
      principal: names.principal,
    })
    await withClient(names.database, names.principal, currentPassword, async (client) => {
      await expect(
        client.query("INSERT INTO public.items VALUES (2, 'written')"),
      ).resolves.toBeDefined()
    })

    await engine.setPrincipalAccess(adminConfig, {
      database: names.database,
      level: 'read',
      principal: names.principal,
    })
    await adminSql(names.database, 'CREATE TABLE public.future_read_items (id integer)')
    await withClient(names.database, names.principal, currentPassword, async (client) => {
      await expect(client.query('SELECT * FROM public.future_read_items')).resolves.toBeDefined()
      await expect(client.query('INSERT INTO public.items VALUES (3)')).rejects.toMatchObject({
        code: '42501',
      })
    })
  })

  it('validates the database before clearing existing access', async () => {
    await expect(
      engine.setPrincipalAccess(adminConfig, {
        database: `missing_${suffix}`,
        level: 'write',
        principal: names.principal,
      }),
    ).rejects.toMatchObject({ code: 'DATABASE_NOT_FOUND', status: 404 })
    await withClient(names.database, names.principal, currentPassword, async (client) => {
      await expect(client.query('SELECT * FROM public.items')).resolves.toBeDefined()
    })
  })

  it('disables and re-enables LOGIN without discarding the credential', async () => {
    await engine.setPrincipalLogin(adminConfig, { enabled: false, principal: names.principal })
    const disabled = (await engine.getSnapshot(adminConfig)).principals.find(
      ({ name }) => name === names.principal,
    )
    expect(disabled?.canLogin).toBe(false)

    await engine.setPrincipalLogin(adminConfig, { enabled: true, principal: names.principal })
    await withClient(names.database, names.principal, currentPassword, async (client) => {
      await expect(client.query('SELECT 1')).resolves.toBeDefined()
    })
  })

  it('rotates to a SCRAM verifier and returns a usable one-time password', async () => {
    const oldPassword = currentPassword
    const rotated = await engine.rotatePrincipalPassword(adminConfig, {
      principal: names.principal,
    })
    currentPassword = rotated.oneTimePassword

    await expect(
      withClient(names.database, names.principal, oldPassword, async (client) =>
        client.query('SELECT 1'),
      ),
    ).rejects.toMatchObject({ code: '28P01' })
    await withClient(names.database, names.principal, currentPassword, async (client) => {
      await expect(client.query('SELECT 1')).resolves.toBeDefined()
    })
    await withClient(
      maintenanceDatabase,
      adminConfig.username,
      adminConfig.password,
      async (client) => {
        const result = await client.query<PasswordRow>(
          'SELECT rolpassword AS password FROM pg_authid WHERE rolname = $1',
          [names.principal],
        )
        expect(result.rows[0]?.password).toMatch(/^SCRAM-SHA-256\$4096:/u)
        expect(result.rows[0]?.password).not.toContain(currentPassword)
      },
    )
  })

  it.each([names.createdb, names.createrole, names.superuser, adminConfig.username])(
    'protects elevated or active role %s from lifecycle mutations',
    async (principal) => {
      for (const operation of [
        () => engine.setPrincipalLogin(adminConfig, { enabled: false, principal }),
        () => engine.rotatePrincipalPassword(adminConfig, { principal }),
        () => engine.dropPrincipal(adminConfig, { principal }),
      ]) {
        await expect(operation()).rejects.toEqual(
          expect.objectContaining<Partial<ManagerError>>({ code: 'PROTECTED_PRINCIPAL' }),
        )
      }
    },
  )

  it('rejects password rotation through an inherited privileged membership', async () => {
    const before = await withClient(
      maintenanceDatabase,
      adminConfig.username,
      adminConfig.password,
      async (client) => {
        const result = await client.query<PasswordRow>(
          'SELECT rolpassword AS password FROM pg_authid WHERE rolname = $1',
          [names.inheritedChild],
        )
        return result.rows[0]?.password ?? null
      },
    )

    await expect(
      engine.rotatePrincipalPassword(adminConfig, { principal: names.inheritedChild }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ManagerError>>({ code: 'PROTECTED_PRINCIPAL' }),
    )

    const after = await withClient(
      maintenanceDatabase,
      adminConfig.username,
      adminConfig.password,
      async (client) => {
        const result = await client.query<PasswordRow>(
          'SELECT rolpassword AS password FROM pg_authid WHERE rolname = $1',
          [names.inheritedChild],
        )
        return result.rows[0]?.password ?? null
      },
    )
    expect(after).toBe(before)
  })

  it('rejects login mutation through a SET-only privileged membership', async () => {
    await withClient(
      maintenanceDatabase,
      names.setOnlyChild,
      setOnlyChildPassword,
      async (client) => {
        const result = await client.query<{ canInherit: boolean; canSet: boolean }>(
          `SELECT pg_has_role(current_user, $1, 'USAGE') AS "canInherit",
            pg_has_role(current_user, $1, 'SET') AS "canSet"`,
          [names.unsafeParent],
        )
        expect(result.rows[0]).toEqual({ canInherit: false, canSet: true })
      },
    )

    await expect(
      engine.setPrincipalLogin(adminConfig, { enabled: false, principal: names.setOnlyChild }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ManagerError>>({ code: 'PROTECTED_PRINCIPAL' }),
    )
    const principal = (await engine.getSnapshot(adminConfig)).principals.find(
      ({ name }) => name === names.setOnlyChild,
    )
    expect(principal?.canLogin).toBe(true)
  })

  it('refuses a safe drop while managed privileges still depend on the role', async () => {
    await expect(
      engine.dropPrincipal(adminConfig, { principal: names.principal }),
    ).rejects.toMatchObject({ code: '2BP01' })
  })

  it('revokes direct and default privileges, reports PUBLIC, then safely drops the role', async () => {
    const result = await engine.revokePrincipalAccess(adminConfig, {
      database: names.database,
      principal: names.principal,
    })
    expect(result.warnings).toContain(
      `Direct access was revoked, but PUBLIC still grants CONNECT to ${names.database}.`,
    )

    await adminSql(names.database, 'CREATE TABLE public.future_revoked_items (id integer)')
    await withClient(names.database, names.principal, currentPassword, async (client) => {
      await expect(client.query('SELECT 1')).resolves.toBeDefined()
      await expect(client.query('SELECT * FROM public.items')).rejects.toMatchObject({
        code: '42501',
      })
      await expect(client.query('SELECT * FROM public.future_revoked_items')).rejects.toMatchObject(
        {
          code: '42501',
        },
      )
    })

    await engine.dropPrincipal(adminConfig, { principal: names.principal })
    const snapshot = await engine.getSnapshot(adminConfig)
    expect(snapshot.principals.some(({ name }) => name === names.principal)).toBe(false)
  })
})
