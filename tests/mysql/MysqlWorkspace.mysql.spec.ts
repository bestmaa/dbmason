import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MysqlEngine } from '@/modules/database-manager/infrastructure/mysql/MysqlEngine'

import { dropMysqlResources, mysqlAdmin, mysqlTestConfig } from './mysqlHarness'

const database = 'dbm_backend_workspace'
const sideEffectDatabase = 'dbm_workspace_side_effect'
const reader = 'dbm_workspace_reader@%'
const developer = 'dbm_workspace_developer@%'
const accounts = [reader, developer] as const
const engine = new MysqlEngine()
let readerPassword = ''
let developerPassword = ''

describe.sequential('MySQL guarded workspace', () => {
  beforeAll(async () => {
    await dropMysqlResources([database, sideEffectDatabase], accounts)
    const config = mysqlTestConfig()
    await engine.createDatabase(config, { name: database, owner: null })
    await engine.createDatabase(config, { name: sideEffectDatabase, owner: null })
    const admin = await mysqlAdmin()
    try {
      await admin.query(`CREATE TABLE \`${database}\`.items (id INT PRIMARY KEY, label VARCHAR(80))`)
      await admin.query(
        `INSERT INTO \`${database}\`.items VALUES (1, 'first row'), (2, 'second row')`,
      )
      await admin.query(
        `CREATE TABLE \`${sideEffectDatabase}\`.effects (id INT AUTO_INCREMENT PRIMARY KEY)`,
      )
      await admin.query(
        `CREATE PROCEDURE \`${sideEffectDatabase}\`.write_effect() INSERT INTO \`${sideEffectDatabase}\`.effects VALUES ()`,
      )
    } finally {
      await admin.end()
    }
    readerPassword = (
      await engine.createPrincipal(config, {
        access: [{ database, level: 'read' }],
        name: reader,
      })
    ).oneTimePassword
    developerPassword = (
      await engine.createPrincipal(config, {
        access: [{ database, level: 'developer' }],
        name: developer,
      })
    ).oneTimePassword
  })

  afterAll(async () => {
    await dropMysqlResources([database, sideEffectDatabase], accounts)
  })

  it('discovers and browses only relations visible to the transient account', async () => {
    const config = mysqlTestConfig()
    const credential = { database, password: readerPassword, principal: reader }
    const catalog = await engine.loadWorkspaceCatalog(config, credential)
    expect(catalog.relations).toContainEqual(
      expect.objectContaining({ kind: 'table', name: 'items', schema: database }),
    )
    const result = await engine.browseWorkspaceRelation(config, {
      ...credential,
      limit: 1,
      offset: 0,
      relation: 'items',
      schema: database,
    })
    expect(result.rowCount).toBe(1)
    expect(result.truncated).toBe(true)
    expect(result.columns.map((column) => column.name)).toEqual(['id', 'label'])
  })

  it('runs one bounded SELECT and verifies the authenticated user@host identity', async () => {
    const result = await engine.runWorkspaceReadOnlyQuery(mysqlTestConfig(), {
      database,
      maxRows: 20,
      password: readerPassword,
      principal: reader,
      sql: 'SELECT CURRENT_USER() AS identity, label FROM items ORDER BY id',
    })
    expect(result.rowCount).toBe(2)
    expect(result.rows[0]).toContain(reader)
  })

  it('blocks writes and stacked statements without changing persistent rows', async () => {
    await engine.setPrincipalAccess(mysqlTestConfig(), {
      database,
      level: 'write',
      principal: reader,
    })
    const command = {
      database,
      maxRows: 20,
      password: readerPassword,
      principal: reader,
    }
    await expect(
      engine.runWorkspaceReadOnlyQuery(mysqlTestConfig(), {
        ...command,
        sql: "UPDATE items SET label = 'changed' WHERE id = 1",
      }),
    ).rejects.toMatchObject({ code: 'QUERY_WRITE_BLOCKED' })
    await expect(
      engine.runWorkspaceReadOnlyQuery(mysqlTestConfig(), {
        ...command,
        sql: 'SELECT 1; SELECT 2',
      }),
    ).rejects.toMatchObject({ code: 'QUERY_INVALID' })
    const admin = await mysqlAdmin()
    try {
      const [rows] = await admin.query(`SELECT label FROM \`${database}\`.items WHERE id = 1`)
      expect(rows).toMatchObject([{ label: 'first row' }])
    } finally {
      await admin.end()
    }
  })

  it('rejects accounts with temporary-table, DDL, routine, and trigger powers', async () => {
    await expect(
      engine.loadWorkspaceCatalog(mysqlTestConfig(), {
        database,
        password: developerPassword,
        principal: developer,
      }),
    ).rejects.toMatchObject({ code: 'QUERY_PRINCIPAL_UNSAFE' })
  })

  it('enforces the server and socket deadline for expensive reads', async () => {
    const startedAt = performance.now()
    await expect(
      engine.runWorkspaceReadOnlyQuery(mysqlTestConfig(), {
        database,
        maxRows: 1,
        password: readerPassword,
        principal: reader,
        sql: "SELECT BENCHMARK(1000000000, SHA2('bounded', 512))",
      }),
    ).rejects.toMatchObject({ code: 'QUERY_TIMEOUT' })
    expect(performance.now() - startedAt).toBeLessThan(9_000)
  })

  it('rejects dangerous routine privileges granted on another schema before query execution', async () => {
    const admin = await mysqlAdmin()
    try {
      await admin.query(
        `GRANT EXECUTE ON PROCEDURE \`${sideEffectDatabase}\`.write_effect TO 'dbm_workspace_reader'@'%'`,
      )
    } finally {
      await admin.end()
    }
    await expect(
      engine.runWorkspaceReadOnlyQuery(mysqlTestConfig(), {
        database,
        maxRows: 1,
        password: readerPassword,
        principal: reader,
        sql: `CALL \`${sideEffectDatabase}\`.write_effect()`,
      }),
    ).rejects.toMatchObject({ code: 'QUERY_PRINCIPAL_UNSAFE' })
    const inspection = await mysqlAdmin()
    try {
      const [rows] = await inspection.query(
        `SELECT COUNT(*) AS effectCount FROM \`${sideEffectDatabase}\`.effects`,
      )
      expect(rows).toMatchObject([{ effectCount: 0 }])
    } finally {
      await inspection.end()
    }
  })
})
