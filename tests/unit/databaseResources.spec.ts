import { describe, expect, it } from 'vitest'

import {
  buildDatabaseOptions,
  buildDatabaseTableViewModel,
  databaseIsWorkspaceSelectable,
  databaseSearchValues,
} from '@/features/database-manager/model/databaseResources'
import type {
  MysqlDatabaseSummary,
  PostgresDatabaseSummary,
} from '@/modules/database-manager/domain/contracts'

const mysqlDatabase: MysqlDatabaseSummary = {
  defaultCharacterSet: 'utf8mb4',
  defaultCollation: 'utf8mb4_0900_ai_ci',
  engine: 'mysql',
  name: 'app',
  sizeBytes: 1024,
}

const postgresDatabase: PostgresDatabaseSummary = {
  allowConnections: false,
  encoding: 'UTF8',
  engine: 'postgresql',
  name: 'reporting',
  owner: 'analytics',
  publicConnect: true,
  publicTemporary: false,
  sizeBytes: 2048,
}

describe('engine-specific database resource mapping', () => {
  it('maps MySQL charset/collation without synthetic PostgreSQL fields', () => {
    const model = buildDatabaseTableViewModel('mysql', [mysqlDatabase])

    expect(model).toEqual({
      engine: 'mysql',
      rows: [{
        characterSet: 'utf8mb4',
        collation: 'utf8mb4_0900_ai_ci',
        name: 'app',
        sizeLabel: '1 KB',
      }],
    })
    expect(model.rows[0]).not.toHaveProperty('owner')
    expect(model.rows[0]).not.toHaveProperty('isBlocked')
    expect(databaseSearchValues(mysqlDatabase)).toContain('utf8mb4_0900_ai_ci')
    expect(databaseIsWorkspaceSelectable(mysqlDatabase)).toBe(true)
  })

  it('keeps PostgreSQL ownership, connectability, and PUBLIC grants in its variant', () => {
    const model = buildDatabaseTableViewModel('postgresql', [postgresDatabase])

    expect(model).toEqual({
      engine: 'postgresql',
      rows: [{
        accessLabel: 'Blocked',
        encoding: 'UTF8',
        isBlocked: true,
        name: 'reporting',
        owner: 'analytics',
        publicPrivileges: ['CONNECT'],
        sizeLabel: '2 KB',
      }],
    })
    expect(databaseSearchValues(postgresDatabase)).toContain('analytics')
    expect(databaseIsWorkspaceSelectable(postgresDatabase)).toBe(false)
  })

  it('annotates PUBLIC CONNECT only for PostgreSQL database options', () => {
    expect(buildDatabaseOptions([mysqlDatabase, postgresDatabase])).toEqual([
      { label: 'app', value: 'app' },
      { label: 'reporting (PUBLIC CONNECT)', value: 'reporting' },
    ])
  })
})
