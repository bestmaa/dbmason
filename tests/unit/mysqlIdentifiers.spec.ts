import { describe, expect, it } from 'vitest'

import { ManagerError } from '@/modules/database-manager/domain/errors'
import { toManagerError } from '@/modules/database-manager/domain/errors'
import {
  isMysqlSystemSchema,
  parseMysqlAccount,
  quoteMysqlIdentifier,
} from '@/modules/database-manager/infrastructure/mysql/identifiers'
import {
  connectionOptions,
  shouldRetryWithoutTls,
} from '@/modules/database-manager/infrastructure/mysql/mysqlClient'
import { isSafeMysqlWorkspaceGrant } from '@/modules/database-manager/infrastructure/mysql/MysqlWorkspace'
import { quoteIdentifier as quotePostgresIdentifier } from '@/modules/database-manager/infrastructure/postgresql/identifiers'
import {
  createConnectionSchema,
  createDatabaseSchema,
  principalRouteSchema,
} from '@/modules/database-manager/transport/schemas'

describe('MySQL identifier and account boundaries', () => {
  it('quotes identifiers and preserves an explicit user@host identity', () => {
    expect(quoteMysqlIdentifier('report`table')).toBe('`report``table`')
    expect(parseMysqlAccount('app_reader@%')).toEqual({
      canonical: 'app_reader@%',
      host: '%',
      user: 'app_reader',
    })
    expect(parseMysqlAccount('app_reader@db.example.test').host).toBe('db.example.test')
  })

  it('accepts MySQL 64-byte identifiers and longer explicit account hosts at transport', () => {
    const mysqlIdentifier = 'm'.repeat(64)
    const canonicalAccount = `reader@${'h'.repeat(100)}`
    expect(quoteMysqlIdentifier(mysqlIdentifier)).toBe(`\`${mysqlIdentifier}\``)
    expect(createDatabaseSchema.parse({ name: mysqlIdentifier, owner: null }).name).toBe(
      mysqlIdentifier,
    )
    expect(principalRouteSchema.parse({ principal: canonicalAccount }).principal).toBe(
      canonicalAccount,
    )
    expect(parseMysqlAccount(canonicalAccount).canonical).toBe(canonicalAccount)
    expect(() => quoteMysqlIdentifier('m'.repeat(65))).toThrow(ManagerError)
    expect(() => quotePostgresIdentifier(mysqlIdentifier)).toThrow(RangeError)
  })

  it.each(['app_reader', '@%', 'app@@%', 'app@%.example', "app'bad@%", 'app@host_name'])(
    'rejects ambiguous or wildcard account %s',
    (principal) => {
      expect(() => parseMysqlAccount(principal)).toThrow(ManagerError)
    },
  )

  it('protects system schemas case-insensitively', () => {
    expect(isMysqlSystemSchema('MYSQL')).toBe(true)
    expect(isMysqlSystemSchema('application')).toBe(false)
  })

  it('only retries the explicit unsupported-TLS handshake', () => {
    const unsupported = Object.assign(new Error('Server does not support secure connection'), {
      code: 'HANDSHAKE_NO_SSL_SUPPORT',
    })
    expect(shouldRetryWithoutTls(unsupported)).toBe(true)
    expect(shouldRetryWithoutTls(Object.assign(new Error('bad cert'), { code: 'CERT_ERROR' }))).toBe(
      false,
    )
  })

  it('pins the vetted address while preserving the requested TLS hostname', () => {
    const options = connectionOptions(
      {
        database: 'mysql',
        host: 'db.example.test',
        password: 'secret',
        port: 3306,
        sslMode: 'verify-full',
        username: 'root',
      },
      'mysql',
      '203.0.113.25',
    )
    expect(options.host).toBe('db.example.test')
    expect(typeof options.stream).toBe('function')
    expect(options.ssl).toMatchObject({ rejectUnauthorized: true, verifyIdentity: true })
  })

  it.each([
    "GRANT USAGE ON *.* TO `reader`@`%`",
    "GRANT SELECT, SHOW VIEW ON `app`.* TO `reader`@`%`",
    "GRANT SELECT (`safe``column`), UPDATE (`label`) ON `app`.`items` TO `reader`@`%`",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON `app`.* TO `writer`@`%`",
  ])('allows a workspace-safe SHOW GRANTS row: %s', (grant) => {
    expect(isSafeMysqlWorkspaceGrant(grant)).toBe(true)
  })

  it.each([
    "GRANT SELECT ON *.* TO `reader`@`%`",
    "GRANT SELECT ON `app`.* TO `reader`@`%` WITH GRANT OPTION",
    "GRANT EXECUTE ON PROCEDURE `app`.`write_effect` TO `reader`@`%`",
    "GRANT CREATE TEMPORARY TABLES ON `app`.* TO `reader`@`%`",
    "GRANT `admin_role`@`%` TO `reader`@`%`",
    "GRANT PROXY ON `root`@`%` TO `reader`@`%`",
    "SET DEFAULT ROLE `admin_role`@`%` TO `reader`@`%`",
  ])('rejects a dangerous or unclassified SHOW GRANTS row: %s', (grant) => {
    expect(isSafeMysqlWorkspaceGrant(grant)).toBe(false)
  })

  it('applies engine-aware connection defaults without changing PostgreSQL defaults', () => {
    const shared = {
      host: 'database.example.test',
      name: 'Remote database',
      password: 'secret',
      sslMode: 'verify-full' as const,
      username: 'administrator',
    }
    expect(createConnectionSchema.parse({ ...shared, engine: 'mysql' })).toMatchObject({
      engine: 'mysql',
      maintenanceDatabase: 'mysql',
      port: 3306,
    })
    expect(createConnectionSchema.parse(shared)).toMatchObject({
      engine: 'postgresql',
      maintenanceDatabase: 'postgres',
      port: 5432,
    })
  })

  it.each([
    ['ER_BAD_DB_ERROR', 'DATABASE_NOT_FOUND', 404],
    ['ER_DB_CREATE_EXISTS', 'ALREADY_EXISTS', 409],
    ['ER_SPECIFIC_ACCESS_DENIED_ERROR', 'INSUFFICIENT_PRIVILEGE', 403],
    ['MYSQL_CAPACITY', 'SERVER_BUSY', 503],
  ])('maps MySQL %s to a safe manager error', (driverCode, code, status) => {
    expect(toManagerError({ code: driverCode })).toMatchObject({ code, status })
  })
})
