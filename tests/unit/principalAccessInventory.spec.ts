import { describe, expect, it } from 'vitest'

import {
  classifyMysqlDirectAccess,
} from '@/modules/database-manager/infrastructure/mysql/MysqlAccessInventory'
import {
  hasUnescapedMysqlWildcard,
  mysqlDatabaseGrantPattern,
  mysqlGrantPatternMatches,
} from '@/modules/database-manager/infrastructure/mysql/mysqlPrivilegeScope'
import {
  classifyPostgresDirectAccess,
  classifyPostgresEffectiveAccess,
} from '@/modules/database-manager/infrastructure/postgresql/PostgresAccessInventory'
import type {
  PostgresScopeEvidence,
} from '@/modules/database-manager/infrastructure/postgresql/PostgresAccessInventory'

function postgresScope(
  overrides: Partial<PostgresScopeEvidence> = {},
): PostgresScopeEvidence {
  return {
    directAnyObjectPrivilege: false,
    directDefaultAnyPrivilege: false,
    directDefaultSequencesDeveloperExact: true,
    directDefaultSequencesReadExact: true,
    directDefaultSequencesWriteExact: true,
    directDefaultTablesDeveloperExact: true,
    directDefaultTablesReadExact: true,
    directDefaultTablesWriteExact: true,
    directGrantOption: false,
    directOutsideManagedScope: false,
    directSchemaPrivileges: [],
    directSequencesDeveloperExact: true,
    directSequencesReadExact: true,
    directSequencesWriteExact: true,
    directTablesDeveloperExact: true,
    directTablesReadExact: true,
    directTablesWriteExact: true,
    effectiveAnyObjectPrivilege: false,
    effectiveGrantOption: false,
    effectiveOutsideManagedScope: false,
    effectiveOwner: false,
    effectiveSchemaCreate: false,
    effectiveSchemaUsage: false,
    effectiveSequencesDeveloperExact: true,
    effectiveSequencesReadExact: true,
    effectiveSequencesWriteExact: true,
    effectiveTablesDeveloperExact: true,
    effectiveTablesReadExact: true,
    effectiveTablesWriteExact: true,
    hasManagedObjects: true,
    hasPublicSchema: true,
    inheritedAccess: false,
    ownsManagedObject: false,
    publicAccess: false,
    roleSwitchAccess: false,
    roleSwitchOwner: false,
    ...overrides,
  }
}

const target = {
  directConnect: false,
  directCreate: false,
  directDatabaseGrantOption: false,
  directTemporary: false,
  effectiveCreate: false,
  effectiveDatabaseGrantOption: false,
  effectiveOwner: false,
  effectiveTemporary: false,
  isOwner: false,
  principalPrivileged: false,
}

describe('PostgreSQL principal access classification', () => {
  it('distinguishes no direct grant from effective PUBLIC connect', () => {
    const scope = postgresScope()
    expect(classifyPostgresDirectAccess(target, scope)).toBe('none')
    expect(classifyPostgresEffectiveAccess(true, target, scope)).toBe('connect')
  })

  it.each([
    ['read', ['USAGE'], 'read'],
    ['write', ['USAGE'], 'write'],
    ['developer', ['CREATE', 'USAGE'], 'developer'],
  ] as const)('matches the exact %s preset shape', (expected, schema, shape) => {
    const scope = postgresScope({
      directAnyObjectPrivilege: true,
      directSchemaPrivileges: [...schema],
      directSequencesDeveloperExact: shape === 'developer',
      directSequencesReadExact: shape === 'read',
      directSequencesWriteExact: shape === 'write',
      directTablesDeveloperExact: shape === 'developer',
      directTablesReadExact: shape === 'read',
      directTablesWriteExact: shape === 'write',
    })
    expect(classifyPostgresDirectAccess({ ...target, directConnect: true }, scope)).toBe(expected)
  })

  it('returns custom for partial, owner, grant-option, and empty-database ambiguity', () => {
    expect(
      classifyPostgresDirectAccess(
        { ...target, directConnect: true, directDatabaseGrantOption: true },
        postgresScope(),
      ),
    ).toBe('custom')
    expect(
      classifyPostgresEffectiveAccess(
        true,
        { ...target, effectiveDatabaseGrantOption: true },
        postgresScope(),
      ),
    ).toBe('custom')
    expect(
      classifyPostgresEffectiveAccess(
        true,
        target,
        postgresScope({ effectiveOutsideManagedScope: true }),
      ),
    ).toBe('custom')
    expect(
      classifyPostgresDirectAccess(
        { ...target, directConnect: true },
        postgresScope({
          directAnyObjectPrivilege: true,
          directSchemaPrivileges: ['USAGE'],
          directTablesReadExact: false,
          directTablesWriteExact: false,
        }),
      ),
    ).toBe('custom')
    expect(
      classifyPostgresDirectAccess(
        { ...target, directConnect: true, isOwner: true },
        postgresScope(),
      ),
    ).toBe('custom')
    expect(
      classifyPostgresDirectAccess(
        { ...target, directConnect: true, principalPrivileged: true },
        postgresScope(),
      ),
    ).toBe('custom')
    expect(
      classifyPostgresDirectAccess(
        { ...target, directConnect: true },
        postgresScope({ directGrantOption: true }),
      ),
    ).toBe('custom')
    expect(
      classifyPostgresDirectAccess(
        { ...target, directConnect: true },
        postgresScope({
          directSchemaPrivileges: ['USAGE'],
          directDefaultSequencesDeveloperExact: false,
          directDefaultSequencesReadExact: false,
          directDefaultSequencesWriteExact: false,
          directDefaultTablesDeveloperExact: false,
          directDefaultTablesReadExact: false,
          directDefaultTablesWriteExact: false,
          hasManagedObjects: false,
        }),
      ),
    ).toBe('custom')
  })
})

describe('MySQL principal access classification', () => {
  it('keeps authentication-only separate from per-database connect', () => {
    expect(classifyMysqlDirectAccess([], false, false)).toBe('none')
  })

  it('recognizes escaped and unescaped database grant patterns', () => {
    expect(hasUnescapedMysqlWildcard('tenant_%')).toBe(true)
    expect(hasUnescapedMysqlWildcard('tenant\\_\\%')).toBe(false)
    expect(mysqlGrantPatternMatches('tenant\\_\\%', 'tenant_%')).toBe(true)
    expect(mysqlGrantPatternMatches('tenant_%', 'tenant_a')).toBe(true)
    expect(mysqlGrantPatternMatches('TENANT%', 'tenant')).toBe(false)
    expect(mysqlGrantPatternMatches('db_', 'db')).toBe(false)
    expect(mysqlGrantPatternMatches('db_', 'db1')).toBe(true)
    expect(mysqlGrantPatternMatches('trail\\', 'trail\\')).toBe(true)
    expect(mysqlDatabaseGrantPattern('tenant_%', false)).toBe('tenant\\_\\%')
    expect(mysqlDatabaseGrantPattern('tenant_%', true)).toBe('tenant_%')
  })

  it('matches adversarial wildcard patterns without regular-expression backtracking', () => {
    expect(
      mysqlGrantPatternMatches(`${'%a'.repeat(7)}b`, 'a'.repeat(64)),
    ).toBe(false)
  })

  it.each([
    [['SELECT', 'SHOW VIEW'], 'read'],
    [['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'SHOW VIEW'], 'write'],
    [
      [
        'ALTER',
        'ALTER ROUTINE',
        'CREATE',
        'CREATE ROUTINE',
        'CREATE TEMPORARY TABLES',
        'CREATE VIEW',
        'DELETE',
        'DROP',
        'EVENT',
        'EXECUTE',
        'INDEX',
        'INSERT',
        'LOCK TABLES',
        'REFERENCES',
        'SELECT',
        'SHOW VIEW',
        'TRIGGER',
        'UPDATE',
      ],
      'developer',
    ],
  ] as const)('matches an exact schema preset', (privileges, expected) => {
    expect(classifyMysqlDirectAccess(privileges, false, false)).toBe(expected)
  })

  it('fails partial, object-level, and grant-option shapes to custom', () => {
    expect(classifyMysqlDirectAccess(['SELECT'], false, false)).toBe('custom')
    expect(classifyMysqlDirectAccess(['SELECT', 'SHOW VIEW'], true, false)).toBe('custom')
    expect(classifyMysqlDirectAccess(['SELECT', 'SHOW VIEW'], false, true)).toBe('custom')
  })
})
