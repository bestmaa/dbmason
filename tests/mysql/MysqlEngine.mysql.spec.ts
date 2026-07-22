import { createConnection } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ManagerError } from '@/modules/database-manager/domain/errors'
import { MysqlEngine } from '@/modules/database-manager/infrastructure/mysql/MysqlEngine'

import { dropMysqlResources, mysqlAdmin, mysqlTestConfig } from './mysqlHarness'

const database = 'dbm_backend_engine'
const reader = 'dbm_backend_reader@%'
const privileged = 'dbm_backend_global@%'
const grantCapable = 'dbm_backend_grant@%'
const roleMember = 'dbm_backend_member@%'
const proxyMember = 'dbm_backend_proxy@%'
const scoped = 'dbm_backend_scoped@%'
const role = 'dbm_backend_role'
const accounts = [reader, privileged, grantCapable, roleMember, proxyMember, scoped] as const
const engine = new MysqlEngine()

describe.sequential('MysqlEngine against MySQL 8.4', () => {
  beforeAll(async () => {
    await dropMysqlResources([database], accounts, [role])
  })

  afterAll(async () => {
    await dropMysqlResources([database], accounts, [role])
  })

  it('tests the connection and returns a genuine MySQL inventory/observability snapshot', async () => {
    const config = mysqlTestConfig()
    const test = await engine.testConnection(config)
    expect(test.serverVersion).toMatch(/^8\.4\./u)
    expect(test.latencyMs).toBeGreaterThanOrEqual(0)

    const snapshot = await engine.getSnapshot(config)
    expect(snapshot.engine).toBe('mysql')
    expect(snapshot.currentUser).toContain('@')
    expect(snapshot.capabilities).toMatchObject({
      supportsDatabaseOwners: false,
      supportsReadOnlyWorkspace: true,
      supportsSchemas: false,
    })
    expect(snapshot.databases.find((item) => item.name === 'mysql')).toMatchObject({
      defaultCharacterSet: expect.any(String),
      defaultCollation: expect.any(String),
      engine: 'mysql',
    })
    expect(snapshot.databases[0]).not.toHaveProperty('owner')
    expect(snapshot.databases[0]).not.toHaveProperty('publicConnect')
    expect(snapshot.principals.every((principal) => principal.name.includes('@'))).toBe(true)

    const observability = await engine.getObservability(config)
    expect(observability.engine).toBe('mysql')
    expect(observability.source).toBe('mysql-server-status')
    expect(observability.hostTelemetry).toEqual({
      reason: 'external-provider-required',
      status: 'unavailable',
    })
    expect(observability.serverStatus.questions).toMatch(/^\d+$/u)
    expect(observability.serverStatus.bytesReceived).toMatch(/^\d+$/u)
    expect(observability.serverStatus.threadsRunning).toBeGreaterThanOrEqual(0)
    expect(observability.activity.status).toBe('available')
    expect(observability.tracking.activities).toBe(true)
    expect(observability.databases.every((metric) => /^\d+$/u.test(metric.sizeBytes ?? '0'))).toBe(
      true,
    )
    expect('clusterIo' in observability).toBe(false)
  })

  it('creates a database/account and applies explicit access presets', async () => {
    const config = mysqlTestConfig()
    await engine.createDatabase(config, { name: database, owner: null })
    const created = await engine.createPrincipal(config, {
      access: [{ database, level: 'connect' }],
      name: reader,
    })
    expect(created.principal).toBe(reader)
    expect(created.oneTimePassword).toMatch(/^[A-Za-z0-9_-]{32}$/u)
    expect(created.warnings.join(' ')).toContain('no per-database CONNECT privilege')

    await engine.setPrincipalAccess(config, { database, level: 'read', principal: reader })
    const admin = await mysqlAdmin()
    try {
      await admin.query(`CREATE TABLE \`${database}\`.items (id INT PRIMARY KEY, label VARCHAR(50))`)
      await admin.query(`INSERT INTO \`${database}\`.items VALUES (1, 'visible')`)
    } finally {
      await admin.end()
    }
    const restricted = await createConnection({
      database,
      host: config.host,
      password: created.oneTimePassword,
      port: config.port,
      user: 'dbm_backend_reader',
    })
    try {
      const [rows] = await restricted.query('SELECT label FROM items')
      expect(rows).toMatchObject([{ label: 'visible' }])
      await expect(restricted.query("INSERT INTO items VALUES (2, 'blocked')")).rejects.toMatchObject({
        code: 'ER_TABLEACCESS_DENIED_ERROR',
      })
    } finally {
      await restricted.end()
    }
  })

  it('locks, unlocks, rotates, and drops a restricted account', async () => {
    const config = mysqlTestConfig()
    const rotated = await engine.rotatePrincipalPassword(config, { principal: reader })
    await engine.setPrincipalLogin(config, { enabled: false, principal: reader })
    await expect(
      createConnection({
        database,
        host: config.host,
        password: rotated.oneTimePassword,
        port: config.port,
        user: 'dbm_backend_reader',
      }),
    ).rejects.toMatchObject({ code: 'ER_ACCOUNT_HAS_BEEN_LOCKED' })
    await engine.setPrincipalLogin(config, { enabled: true, principal: reader })
    const connection = await createConnection({
      database,
      host: config.host,
      password: rotated.oneTimePassword,
      port: config.port,
      user: 'dbm_backend_reader',
    })
    await connection.end()
    await engine.dropPrincipal(config, { principal: reader })
  })

  it('reconciles pre-existing table, column, and routine grants before replacement', async () => {
    const config = mysqlTestConfig()
    const created = await engine.createPrincipal(config, {
      access: [{ database, level: 'connect' }],
      name: scoped,
    })
    const admin = await mysqlAdmin()
    try {
      await admin.query(`DROP PROCEDURE IF EXISTS \`${database}\`.read_item`)
      await admin.query(`CREATE PROCEDURE \`${database}\`.read_item() SELECT 1 AS visible`)
      await admin.query(`GRANT SELECT ON \`${database}\`.items TO 'dbm_backend_scoped'@'%'`)
      await admin.query(
        `GRANT UPDATE (label) ON \`${database}\`.items TO 'dbm_backend_scoped'@'%'`,
      )
      await admin.query(
        `GRANT EXECUTE ON PROCEDURE \`${database}\`.read_item TO 'dbm_backend_scoped'@'%'`,
      )
    } finally {
      await admin.end()
    }

    await engine.setPrincipalAccess(config, { database, level: 'read', principal: scoped })
    const inspection = await mysqlAdmin()
    try {
      const [rows] = await inspection.query(
        `SELECT
          (SELECT COUNT(*) FROM information_schema.TABLE_PRIVILEGES
            WHERE GRANTEE = ? AND TABLE_SCHEMA = ?) AS tableGrants,
          (SELECT COUNT(*) FROM information_schema.COLUMN_PRIVILEGES
            WHERE GRANTEE = ? AND TABLE_SCHEMA = ?) AS columnGrants,
          (SELECT COUNT(*) FROM mysql.procs_priv
            WHERE User = ? AND Host = ? AND Db = ?) AS routineGrants`,
        [
          "'dbm_backend_scoped'@'%'",
          database,
          "'dbm_backend_scoped'@'%'",
          database,
          'dbm_backend_scoped',
          '%',
          database,
        ],
      )
      expect(rows).toMatchObject([{ columnGrants: 0, routineGrants: 0, tableGrants: 0 }])
    } finally {
      await inspection.end()
    }

    await engine.revokePrincipalAccess(config, { database, principal: scoped })
    await expect(
      createConnection({
        database,
        host: config.host,
        password: created.oneTimePassword,
        port: config.port,
        user: 'dbm_backend_scoped',
      }),
    ).rejects.toMatchObject({ code: 'ER_DBACCESS_DENIED_ERROR' })
    await engine.dropPrincipal(config, { principal: scoped })
  })

  it('fails closed for global privileges, role edges, system schemas, and owners', async () => {
    const config = mysqlTestConfig()
    const admin = await mysqlAdmin()
    try {
      await admin.query(`CREATE USER 'dbm_backend_global'@'%' IDENTIFIED BY 'test-only-global'`)
      await admin.query(`GRANT SELECT ON *.* TO 'dbm_backend_global'@'%'`)
      await admin.query(`CREATE USER 'dbm_backend_grant'@'%' IDENTIFIED BY 'test-only-grant'`)
      await admin.query(
        `GRANT SELECT (label) ON \`${database}\`.items TO 'dbm_backend_grant'@'%' WITH GRANT OPTION`,
      )
      await admin.query(`CREATE USER 'dbm_backend_member'@'%' IDENTIFIED BY 'test-only-member'`)
      await admin.query(`CREATE ROLE '${role}'@'%'`)
      await admin.query(`GRANT '${role}'@'%' TO 'dbm_backend_member'@'%'`)
      await admin.query(`CREATE USER 'dbm_backend_proxy'@'%' IDENTIFIED BY 'test-only-proxy'`)
      await admin.query(`GRANT PROXY ON 'root'@'%' TO 'dbm_backend_proxy'@'%'`)
    } finally {
      await admin.end()
    }
    await expect(
      engine.rotatePrincipalPassword(config, { principal: privileged }),
    ).rejects.toMatchObject({ code: 'PRINCIPAL_PROTECTED' } satisfies Partial<ManagerError>)
    await expect(
      engine.rotatePrincipalPassword(config, { principal: grantCapable }),
    ).rejects.toMatchObject({ code: 'PRINCIPAL_PROTECTED' } satisfies Partial<ManagerError>)
    await expect(engine.dropPrincipal(config, { principal: roleMember })).rejects.toMatchObject({
      code: 'PRINCIPAL_PROTECTED',
    } satisfies Partial<ManagerError>)
    await expect(
      engine.rotatePrincipalPassword(config, { principal: proxyMember }),
    ).rejects.toMatchObject({ code: 'PRINCIPAL_PROTECTED' } satisfies Partial<ManagerError>)
    await expect(
      engine.setPrincipalAccess(config, {
        database: 'mysql',
        level: 'read',
        principal: privileged,
      }),
    ).rejects.toBeInstanceOf(ManagerError)
    await expect(
      engine.createDatabase(config, { name: 'unused', owner: 'root@%' }),
    ).rejects.toMatchObject({
      code: 'DATABASE_OWNER_UNSUPPORTED',
    } satisfies Partial<ManagerError>)
  })
})
