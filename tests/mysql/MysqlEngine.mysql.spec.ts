import { createConnection } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ManagerError } from '@/modules/database-manager/domain/errors'
import { MysqlEngine } from '@/modules/database-manager/infrastructure/mysql/MysqlEngine'

import { dropMysqlResources, mysqlAdmin, mysqlTestConfig } from './mysqlHarness'

const database = 'dbm_backend_engine'
const lookalikeDatabase = 'dbmXbackendXengine'
const wildcardDatabase = 'dbm_wild_a'
const reader = 'dbm_backend_reader@%'
const privileged = 'dbm_backend_global@%'
const grantCapable = 'dbm_backend_grant@%'
const roleMember = 'dbm_backend_member@%'
const proxyMember = 'dbm_backend_proxy@%'
const scoped = 'dbm_backend_scoped@%'
const wildcardMember = 'dbm_backend_wildcard@%'
const legacyWildcardMember = 'dbm_backend_legacy@%'
const grantFloodMember = 'dbm_backend_flood@%'
const overlapWildcardMember = 'dbm_backend_overlap@%'
const role = 'dbm_backend_role'
const accounts = [
  reader,
  privileged,
  grantCapable,
  roleMember,
  proxyMember,
  scoped,
  wildcardMember,
  legacyWildcardMember,
  grantFloodMember,
  overlapWildcardMember,
] as const
const engine = new MysqlEngine()

describe.sequential('MysqlEngine against MySQL 8.4', () => {
  beforeAll(async () => {
    await dropMysqlResources([database, lookalikeDatabase, wildcardDatabase], accounts, [role])
  })

  afterAll(async () => {
    await dropMysqlResources([database, lookalikeDatabase, wildcardDatabase], accounts, [role])
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
    await engine.createDatabase(config, { name: lookalikeDatabase, owner: null })
    const created = await engine.createPrincipal(config, {
      access: [{ database, level: 'connect' }],
      name: reader,
    })
    expect(created.principal).toBe(reader)
    expect(created.oneTimePassword).toMatch(/^[A-Za-z0-9_-]{32}$/u)
    expect(created.warnings.join(' ')).toContain('no per-database CONNECT privilege')
    const authenticationOnly = await engine.getPrincipalAccess(config, reader)
    expect(
      authenticationOnly.databases.find(({ database: name }) => name === database),
    ).toMatchObject({ directPreset: 'none', effectivePreset: 'none', sources: [] })

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

    const inventory = await engine.getPrincipalAccess(config, reader)
    expect(inventory.databases.find(({ database: name }) => name === database)).toMatchObject({
      directPreset: 'read',
      effectivePreset: 'read',
      potentialPreset: 'read',
      sources: ['direct'],
    })
    await expect(
      createConnection({
        database: lookalikeDatabase,
        host: config.host,
        password: created.oneTimePassword,
        port: config.port,
        user: 'dbm_backend_reader',
      }),
    ).rejects.toMatchObject({ code: 'ER_DBACCESS_DENIED_ERROR' })

    await engine.setPrincipalAccess(config, { database, level: 'write', principal: reader })
    const writeInventory = await engine.getPrincipalAccess(config, reader)
    expect(
      writeInventory.databases.find(({ database: name }) => name === database),
    ).toMatchObject({ directPreset: 'write', effectivePreset: 'write' })

    await engine.setPrincipalAccess(config, { database, level: 'developer', principal: reader })
    const developerInventory = await engine.getPrincipalAccess(config, reader)
    expect(
      developerInventory.databases.find(({ database: name }) => name === database),
    ).toMatchObject({ directPreset: 'developer', effectivePreset: 'developer' })
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

    const customInventory = await engine.getPrincipalAccess(config, scoped)
    expect(
      customInventory.databases.find(({ database: name }) => name === database),
    ).toMatchObject({ directPreset: 'custom', effectivePreset: 'custom' })

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
    const revokedInventory = await engine.getPrincipalAccess(config, scoped)
    expect(
      revokedInventory.databases.find(({ database: name }) => name === database),
    ).toMatchObject({ directPreset: 'none', effectivePreset: 'none', sources: [] })
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

  it('refuses to revoke an ambiguous broad wildcard grant', async () => {
    const config = mysqlTestConfig()
    const admin = await mysqlAdmin()
    try {
      await admin.query(
        "CREATE USER 'dbm_backend_legacy'@'%' IDENTIFIED BY 'test-only-legacy'",
      )
      await admin.query(
        "GRANT SELECT, SHOW VIEW ON `dbm_backend_engine`.* TO 'dbm_backend_legacy'@'%'",
      )
      await admin.query(
        "CREATE USER 'dbm_backend_overlap'@'%' IDENTIFIED BY 'test-only-overlap'",
      )
      await admin.query(
        "GRANT SELECT, SHOW VIEW ON `dbm%`.* TO 'dbm_backend_overlap'@'%'",
      )
    } finally {
      await admin.end()
    }

    await expect(
      engine.setPrincipalAccess(config, {
        database,
        level: 'read',
        principal: legacyWildcardMember,
      }),
    ).rejects.toMatchObject({
      code: 'PRIVILEGE_RECONCILIATION_UNSAFE',
    } satisfies Partial<ManagerError>)
    await expect(
      engine.setPrincipalAccess(config, {
        database,
        level: 'read',
        principal: overlapWildcardMember,
      }),
    ).rejects.toMatchObject({
      code: 'PRIVILEGE_RECONCILIATION_UNSAFE',
    } satisfies Partial<ManagerError>)

    const inspection = await mysqlAdmin()
    try {
      const [rows] = await inspection.query(
        `SELECT Db AS databasePattern FROM mysql.db
        WHERE User = 'dbm_backend_legacy' AND Host = '%'`,
      )
      expect(rows).toMatchObject([{ databasePattern: database }])
    } finally {
      await inspection.end()
    }
    const stillBroad = await createConnection({
      database: lookalikeDatabase,
      host: config.host,
      password: 'test-only-legacy',
      port: config.port,
      user: 'dbm_backend_legacy',
    })
    await stillBroad.end()
  })

  it('returns unknown instead of buffering an excessive database-grant inventory', async () => {
    const config = mysqlTestConfig()
    const admin = await mysqlAdmin()
    try {
      await admin.query(
        "CREATE USER 'dbm_backend_flood'@'%' IDENTIFIED BY 'test-only-flood'",
      )
      for (let index = 0; index < 257; index += 1) {
        const suffix = index.toString().padStart(3, '0')
        await admin.query(
          `GRANT SELECT ON \`dbm_cap_${suffix}\`.* TO 'dbm_backend_flood'@'%'`,
        )
      }
    } finally {
      await admin.end()
    }

    const inventory = await engine.getPrincipalAccess(config, grantFloodMember)
    expect(inventory.truncated).toBe(true)
    expect(inventory.databases.length).toBeGreaterThan(0)
    expect(
      inventory.databases.every(
        (item) =>
          item.directPreset === 'unknown' &&
          item.effectivePreset === 'unknown' &&
          item.potentialPreset === 'unknown',
      ),
    ).toBe(true)
  }, 20_000)

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
      await admin.query(`CREATE DATABASE \`${wildcardDatabase}\``)
      await admin.query(
        `CREATE USER 'dbm_backend_wildcard'@'%' IDENTIFIED BY 'test-only-wildcard'`,
      )
      await admin.query(
        "GRANT SELECT, SHOW VIEW ON `dbm\\_wild\\_%`.* TO 'dbm_backend_wildcard'@'%'",
      )
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
    const globalInventory = await engine.getPrincipalAccess(config, privileged)
    expect(
      globalInventory.databases.find(({ database: name }) => name === database),
    ).toMatchObject({
      directPreset: 'custom',
      effectivePreset: 'custom',
      sources: ['global'],
    })
    const roleInventory = await engine.getPrincipalAccess(config, roleMember)
    expect(
      roleInventory.databases.find(({ database: name }) => name === database),
    ).toMatchObject({
      directPreset: 'none',
      effectivePreset: 'none',
      potentialPreset: 'unknown',
      sources: ['role-switch'],
    })
    const proxyInventory = await engine.getPrincipalAccess(config, proxyMember)
    expect(
      proxyInventory.databases.find(({ database: name }) => name === database),
    ).toMatchObject({ potentialPreset: 'unknown', sources: ['proxy'] })
    const wildcardInventory = await engine.getPrincipalAccess(config, wildcardMember)
    expect(
      wildcardInventory.databases.find(({ database: name }) => name === wildcardDatabase),
    ).toMatchObject({
      directPreset: 'custom',
      effectivePreset: 'custom',
      sources: ['direct'],
    })
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
