import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { DatabaseConnectionConfig } from '@/modules/database-manager/domain/contracts'
import {
  browseWorkspaceRelation,
  loadWorkspaceCatalog,
  runWorkspaceReadOnlyQuery,
} from '@/modules/database-manager/infrastructure/postgresql/PostgresWorkspace'
import { PostgresEngine } from '@/modules/database-manager/infrastructure/postgresql/PostgresEngine'
import { quoteIdentifier } from '@/modules/database-manager/infrastructure/postgresql/identifiers'

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}. Start the isolated PostgreSQL test harness.`)
  return value
}

const host = requiredEnv('POSTGRES_TEST_HOST')
const maintenanceDatabase = requiredEnv('POSTGRES_TEST_DATABASE')
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  throw new Error('PostgreSQL workspace tests only run against a loopback host.')
}
if (!maintenanceDatabase.toLowerCase().includes('test')) {
  throw new Error('POSTGRES_TEST_DATABASE must be explicitly named as a test database.')
}

const port = Number(requiredEnv('POSTGRES_TEST_PORT'))
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('POSTGRES_TEST_PORT must be a valid TCP port.')
}

const adminConfig: DatabaseConnectionConfig = {
  database: maintenanceDatabase,
  host,
  password: requiredEnv('POSTGRES_TEST_PASSWORD'),
  port,
  sslMode: 'disable',
  username: requiredEnv('POSTGRES_TEST_USER'),
}
const suffix = `${process.pid}_${Date.now().toString(36)}`
const names = {
  database: `dbc_test_ws_database_${suffix}`,
  directOwnerRole: `dbc_test_ws_direct_owner_${suffix}`,
  directOwnerTable: `dbc_test_ws_direct_owned_${suffix}`,
  hiddenSchema: `dbc_test_ws_hidden_${suffix}`,
  hiddenTable: `dbc_test_ws_private_${suffix}`,
  inheritedOwnerChildRole: `dbc_test_ws_owner_child_${suffix}`,
  inheritedOwnerRole: `dbc_test_ws_parent_owner_${suffix}`,
  inheritedOwnerTable: `dbc_test_ws_inherited_owned_${suffix}`,
  managementChildRole: `dbc_test_ws_manager_child_${suffix}`,
  managementRole: `dbc_test_ws_manager_${suffix}`,
  notifyChannel: `dbc_test_ws_notify_${suffix}`,
  privilegedRole: `dbc_test_ws_privileged_${suffix}`,
  readerRole: `dbc_test_ws_reader_${suffix}`,
  visibleTable: `dbc_test_ws_items_${suffix}`,
  writeFunction: `dbc_test_ws_attempt_write_${suffix}`,
} as const
const directOwnerPassword = 'TEST_ONLY_workspace_direct_owner_2026'
const inheritedOwnerChildPassword = 'TEST_ONLY_workspace_owner_child_2026'
const managementChildPassword = 'TEST_ONLY_workspace_manager_child_2026'
const managementPassword = 'TEST_ONLY_workspace_manager_2026'
const privilegedPassword = 'TEST_ONLY_workspace_privileged_2026'
const engine = new PostgresEngine()
let readerPassword = ''

function testIdentifier(value: string): string {
  if (!/^dbc_test_ws_[a-z0-9_]+$/u.test(value)) {
    throw new Error(`Refusing a non-workspace-test PostgreSQL identifier: ${value}`)
  }
  return quoteIdentifier(value)
}

function clientConfig(database: string, username: string, password: string) {
  return {
    connectionTimeoutMillis: 5_000,
    database,
    host: adminConfig.host,
    password,
    port: adminConfig.port,
    query_timeout: 10_000,
    statement_timeout: 10_000,
    user: username,
  }
}

async function withClient<T>(
  database: string,
  username: string,
  password: string,
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(clientConfig(database, username, password))
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

async function cleanupExactTestResources(): Promise<void> {
  await withClient(
    maintenanceDatabase,
    adminConfig.username,
    adminConfig.password,
    async (client) => {
      await client.query(`DROP DATABASE IF EXISTS ${testIdentifier(names.database)} WITH (FORCE)`)
      for (const role of [
        names.readerRole,
        names.directOwnerRole,
        names.inheritedOwnerChildRole,
        names.inheritedOwnerRole,
        names.managementChildRole,
        names.managementRole,
        names.privilegedRole,
      ]) {
        await client.query(`DROP ROLE IF EXISTS ${testIdentifier(role)}`)
      }
    },
  )
}

function workspaceCredential(password = readerPassword) {
  return {
    database: names.database,
    password,
    principal: names.readerRole,
  }
}

describe('PostgresWorkspace against the isolated PostgreSQL harness', () => {
  beforeAll(async () => {
    await cleanupExactTestResources()
    await engine.createDatabase(adminConfig, { name: names.database, owner: null })
    await adminSql(
      names.database,
      `CREATE TABLE public.${testIdentifier(names.visibleTable)} (
        id integer PRIMARY KEY,
        label text NOT NULL
      )`,
    )
    await adminSql(
      names.database,
      `INSERT INTO public.${testIdentifier(names.visibleTable)} (id, label)
       SELECT item, 'row-' || item::text FROM generate_series(1, 250) AS item`,
    )
    await adminSql(names.database, `CREATE SCHEMA ${testIdentifier(names.hiddenSchema)}`)
    await adminSql(
      names.database,
      `CREATE TABLE ${testIdentifier(names.hiddenSchema)}.${testIdentifier(names.hiddenTable)} (
        secret text NOT NULL
      )`,
    )
    await adminSql(
      names.database,
      `INSERT INTO ${testIdentifier(names.hiddenSchema)}.${testIdentifier(names.hiddenTable)}
       VALUES ('must remain hidden')`,
    )

    readerPassword = (
      await engine.createPrincipal(adminConfig, {
        access: [{ database: names.database, level: 'read' }],
        name: names.readerRole,
      })
    ).oneTimePassword
    await adminSql(
      names.database,
      `GRANT UPDATE ON public.${testIdentifier(names.visibleTable)} TO ${testIdentifier(names.readerRole)}`,
    )
    await adminSql(
      names.database,
      `CREATE FUNCTION public.${testIdentifier(names.writeFunction)}() RETURNS integer
       LANGUAGE SQL VOLATILE AS $workspace_test$
         UPDATE public.${testIdentifier(names.visibleTable)}
         SET label = 'workspace-write-must-not-persist'
         WHERE id = 1
         RETURNING id
       $workspace_test$`,
    )
    await adminSql(
      maintenanceDatabase,
      `CREATE ROLE ${testIdentifier(names.privilegedRole)} LOGIN CREATEDB PASSWORD '${privilegedPassword}'`,
    )
    await adminSql(
      maintenanceDatabase,
      `CREATE ROLE ${testIdentifier(names.directOwnerRole)} LOGIN PASSWORD '${directOwnerPassword}'`,
    )
    await adminSql(
      names.database,
      `CREATE TABLE public.${testIdentifier(names.directOwnerTable)} (id integer PRIMARY KEY)`,
    )
    await adminSql(
      names.database,
      `ALTER TABLE public.${testIdentifier(names.directOwnerTable)}
       OWNER TO ${testIdentifier(names.directOwnerRole)}`,
    )
    await adminSql(
      maintenanceDatabase,
      `CREATE ROLE ${testIdentifier(names.inheritedOwnerRole)} NOLOGIN`,
    )
    await adminSql(
      maintenanceDatabase,
      `CREATE ROLE ${testIdentifier(names.inheritedOwnerChildRole)} LOGIN
       PASSWORD '${inheritedOwnerChildPassword}'`,
    )
    await adminSql(
      names.database,
      `CREATE TABLE public.${testIdentifier(names.inheritedOwnerTable)} (id integer PRIMARY KEY)`,
    )
    await adminSql(
      names.database,
      `ALTER TABLE public.${testIdentifier(names.inheritedOwnerTable)}
       OWNER TO ${testIdentifier(names.inheritedOwnerRole)}`,
    )
    await adminSql(
      maintenanceDatabase,
      `GRANT ${testIdentifier(names.inheritedOwnerRole)}
       TO ${testIdentifier(names.inheritedOwnerChildRole)}`,
    )
    await adminSql(
      maintenanceDatabase,
      `CREATE ROLE ${testIdentifier(names.managementRole)} LOGIN PASSWORD '${managementPassword}'`,
    )
    await adminSql(
      maintenanceDatabase,
      `CREATE ROLE ${testIdentifier(names.managementChildRole)} LOGIN
       PASSWORD '${managementChildPassword}'`,
    )
    await adminSql(
      names.database,
      `GRANT USAGE ON SCHEMA public TO ${testIdentifier(names.managementRole)}`,
    )
    await adminSql(
      names.database,
      `GRANT SELECT ON public.${testIdentifier(names.visibleTable)}
       TO ${testIdentifier(names.managementRole)}`,
    )
    await adminSql(
      maintenanceDatabase,
      `GRANT ${testIdentifier(names.managementRole)}
       TO ${testIdentifier(names.managementChildRole)} WITH INHERIT FALSE, SET TRUE`,
    )
  })

  afterAll(cleanupExactTestResources)

  it('shows only relations visible to the transient workspace principal', async () => {
    const catalog = await loadWorkspaceCatalog(adminConfig, workspaceCredential())

    expect(catalog).toMatchObject({ database: names.database, truncated: false })
    expect(catalog.relations).toContainEqual(
      expect.objectContaining({
        kind: 'table',
        name: names.visibleTable,
        schema: 'public',
      }),
    )
    expect(
      catalog.relations.some(
        ({ name, schema }) => name === names.hiddenTable || schema === names.hiddenSchema,
      ),
    ).toBe(false)
  })

  it('browses an allowed relation with bounded rows and column metadata', async () => {
    const result = await browseWorkspaceRelation(adminConfig, {
      ...workspaceCredential(),
      limit: 5,
      offset: 0,
      relation: names.visibleTable,
      schema: 'public',
    })

    expect(result.columns).toEqual([
      expect.objectContaining({ name: 'id' }),
      expect.objectContaining({ name: 'label' }),
    ])
    expect(result.rowCount).toBe(5)
    expect(result.rows).toHaveLength(5)
    expect(result.truncated).toBe(true)
  })

  it('runs SELECT and WITH SELECT statements without opening a write transaction', async () => {
    const selected = await runWorkspaceReadOnlyQuery(adminConfig, {
      ...workspaceCredential(),
      maxRows: 10,
      sql: `WITH selected AS (
        SELECT id, label FROM public.${testIdentifier(names.visibleTable)} WHERE id <= 2
      ) SELECT label FROM selected ORDER BY id`,
    })

    expect(selected.columns).toEqual([expect.objectContaining({ name: 'label' })])
    expect(selected.rows).toEqual([['row-1'], ['row-2']])
    expect(selected).toMatchObject({ rowCount: 2, truncated: false, truncatedCells: false })
  })

  it('rejects multiple statements through PostgreSQL extended-query parsing', async () => {
    await expect(
      runWorkspaceReadOnlyQuery(adminConfig, {
        ...workspaceCredential(),
        maxRows: 10,
        sql: 'SELECT 1 AS first_statement; SELECT 2 AS second_statement',
      }),
    ).rejects.toMatchObject({ code: 'QUERY_INVALID', status: 400 })
  })

  it('cancels a long-running query at the fixed statement deadline', async () => {
    const startedAt = performance.now()

    await expect(
      runWorkspaceReadOnlyQuery(adminConfig, {
        ...workspaceCredential(),
        maxRows: 10,
        sql: 'SELECT pg_sleep(8) AS delayed',
      }),
    ).rejects.toMatchObject({ code: 'QUERY_TIMEOUT', status: 408 })

    const elapsedMs = performance.now() - startedAt
    expect(elapsedMs).toBeGreaterThanOrEqual(4_000)
    expect(elapsedMs).toBeLessThan(8_000)
  })

  it('rejects the former wrapper-breakout payload before it can bypass the row cap', async () => {
    await expect(
      runWorkspaceReadOnlyQuery(adminConfig, {
        ...workspaceCredential(),
        maxRows: 2,
        sql: 'SELECT generate_series(1, 10)) AS escaped(value) LIMIT ($1::bigint * 100) --',
      }),
    ).rejects.toMatchObject({ code: 'QUERY_INVALID', status: 400 })

    const bounded = await runWorkspaceReadOnlyQuery(adminConfig, {
      ...workspaceCredential(),
      maxRows: 2,
      sql: 'SELECT value FROM generate_series(1, 10) AS escaped(value)',
    })
    expect(bounded.rows).toEqual([[1], [2]])
    expect(bounded).toMatchObject({ rowCount: 2, truncated: true })
  })

  it('blocks a persistent write and leaves the row unchanged', async () => {
    await expect(
      runWorkspaceReadOnlyQuery(adminConfig, {
        ...workspaceCredential(),
        maxRows: 10,
        sql: `SELECT public.${testIdentifier(names.writeFunction)}()`,
      }),
    ).rejects.toMatchObject({ code: 'QUERY_WRITE_BLOCKED', status: 409 })

    const persisted = await withClient(
      names.database,
      adminConfig.username,
      adminConfig.password,
      (client) =>
        client.query<{ label: string }>(
          `SELECT label FROM public.${testIdentifier(names.visibleTable)} WHERE id = 1`,
        ),
    )
    expect(persisted.rows[0]?.label).toBe('row-1')
  })

  it('returns at most 200 rows and marks the result as truncated', async () => {
    const result = await runWorkspaceReadOnlyQuery(adminConfig, {
      ...workspaceCredential(),
      maxRows: 200,
      sql: `SELECT id FROM public.${testIdentifier(names.visibleTable)} ORDER BY id`,
    })

    expect(result.rowCount).toBe(200)
    expect(result.rows).toHaveLength(200)
    expect(result.rows.at(-1)).toEqual([200])
    expect(result.truncated).toBe(true)
  })

  it('rolls back pg_notify instead of delivering a query-side notification', async () => {
    const listener = new Client(
      clientConfig(names.database, adminConfig.username, adminConfig.password),
    )
    const receivedPayloads: string[] = []
    listener.on('notification', (message) => {
      if (message.channel === names.notifyChannel && message.payload) {
        receivedPayloads.push(message.payload)
      }
    })

    try {
      await listener.connect()
      await listener.query(`LISTEN ${testIdentifier(names.notifyChannel)}`)
      await runWorkspaceReadOnlyQuery(adminConfig, {
        ...workspaceCredential(),
        maxRows: 10,
        sql: `SELECT pg_notify('${names.notifyChannel}', 'must-not-deliver') AS notified`,
      })

      const barrierReceived = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for the PostgreSQL notification barrier.')),
          3_000,
        )
        listener.on('notification', (message) => {
          if (message.channel === names.notifyChannel && message.payload === 'barrier') {
            clearTimeout(timeout)
            resolve()
          }
        })
      })
      await withClient(
        names.database,
        adminConfig.username,
        adminConfig.password,
        async (sender) => {
          await sender.query('SELECT pg_notify($1, $2)', [names.notifyChannel, 'barrier'])
        },
      )
      await barrierReceived

      expect(receivedPayloads).toContain('barrier')
      expect(receivedPayloads).not.toContain('must-not-deliver')
    } finally {
      await listener.end().catch(() => undefined)
    }
  })

  it('bounds both large cells and the total response payload', async () => {
    const result = await runWorkspaceReadOnlyQuery(adminConfig, {
      ...workspaceCredential(),
      maxRows: 40,
      sql: `SELECT repeat('x', 40000) AS large_cell FROM generate_series(1, 40)`,
    })
    const firstCell = result.rows[0]?.[0]

    expect(typeof firstCell).toBe('string')
    expect(String(firstCell).slice(0, 32_768)).toBe('x'.repeat(32_768))
    expect(String(firstCell).length).toBeGreaterThan(32_768)
    expect(result.rowCount).toBeGreaterThan(0)
    expect(result.rowCount).toBeLessThan(40)
    expect(result).toMatchObject({ truncated: true, truncatedCells: true })
  })

  it('rejects an incorrect transient password', async () => {
    await expect(
      loadWorkspaceCatalog(adminConfig, workspaceCredential('TEST_ONLY_definitely_wrong')),
    ).rejects.toMatchObject({ code: '28P01' })
  })

  it.each([
    {
      password: privilegedPassword,
      principal: names.privilegedRole,
    },
    {
      password: adminConfig.password,
      principal: adminConfig.username,
    },
  ])('rejects privileged or current workspace principal $principal', async (credential) => {
    await expect(
      loadWorkspaceCatalog(adminConfig, {
        database: names.database,
        ...credential,
      }),
    ).rejects.toMatchObject({ code: 'QUERY_PRINCIPAL_UNSAFE', status: 409 })
  })

  it.each([
    {
      password: directOwnerPassword,
      principal: names.directOwnerRole,
    },
    {
      password: inheritedOwnerChildPassword,
      principal: names.inheritedOwnerChildRole,
    },
  ])('rejects an object-owning or inherited-owner principal $principal', async (credential) => {
    await expect(
      loadWorkspaceCatalog(adminConfig, {
        database: names.database,
        ...credential,
      }),
    ).rejects.toMatchObject({ code: 'QUERY_PRINCIPAL_UNSAFE', status: 409 })
  })

  it('rejects SET-only membership in the active management connection role', async () => {
    await withClient(
      names.database,
      names.managementChildRole,
      managementChildPassword,
      async (client) => {
        const result = await client.query<{ canInherit: boolean; canSet: boolean }>(
          `SELECT pg_has_role(current_user, $1, 'USAGE') AS "canInherit",
            pg_has_role(current_user, $1, 'SET') AS "canSet"`,
          [names.managementRole],
        )
        expect(result.rows[0]).toEqual({ canInherit: false, canSet: true })
      },
    )

    await expect(
      loadWorkspaceCatalog(
        {
          ...adminConfig,
          database: names.database,
          password: managementPassword,
          username: names.managementRole,
        },
        {
          database: names.database,
          password: managementChildPassword,
          principal: names.managementChildRole,
        },
      ),
    ).rejects.toMatchObject({ code: 'QUERY_PRINCIPAL_UNSAFE', status: 409 })
  })
})
