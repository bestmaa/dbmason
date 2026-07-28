import { afterEach, describe, expect, it, vi } from 'vitest'

import { databaseManagerClient } from '@/features/database-manager/services/databaseManagerClient'

const mysqlConnection = {
  engine: 'mysql',
  externalHost: null,
  externalPort: null,
  externalSslMode: null,
  host: 'mysql.internal',
  id: 'fd56e639-7854-4d7d-a075-e4677f179df6',
  lastCheckedAt: null,
  lastLatencyMs: null,
  name: 'MySQL',
  port: 3306,
  serverVersion: null,
  sslMode: 'verify-full',
  status: 'unknown',
} as const

const snapshotCapabilities = {
  accessLevels: ['connect', 'read', 'write', 'developer'],
  canCreateDatabase: true,
  canCreatePrincipal: true,
  supportsDatabaseOwners: false,
  supportsDefaultPrivileges: false,
  supportsObservability: true,
  supportsReadOnlyWorkspace: true,
  supportsSchemas: false,
} as const

const principal = {
  authenticationUsername: 'reader',
  canCreateDatabase: false,
  canCreateRole: false,
  canLogin: true,
  isSuperuser: false,
  memberships: [],
  name: 'reader@%',
  validUntil: null,
} as const

const mysqlSnapshot = {
  capabilities: snapshotCapabilities,
  currentUser: 'root@%',
  databases: [{
    defaultCharacterSet: 'utf8mb4',
    defaultCollation: 'utf8mb4_0900_ai_ci',
    engine: 'mysql',
    name: 'app',
    sizeBytes: 1024,
  }],
  engine: 'mysql',
  principals: [principal],
  serverVersion: '8.4.6',
} as const

describe('database manager browser client engines', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('parses MySQL connection summaries from the shared engine allowlist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({ connections: [mysqlConnection] }, { status: 200 }),
      ),
    )

    await expect(databaseManagerClient.listConnections()).resolves.toEqual([mysqlConnection])
  })

  it('includes the selected engine when testing and saving a connection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ connection: mysqlConnection }, { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await databaseManagerClient.createConnection({
      engine: 'mysql',
      host: 'mysql.internal',
      maintenanceDatabase: 'mysql',
      name: 'MySQL',
      password: 'secret',
      port: 3306,
      sslMode: 'verify-full',
      username: 'root',
    })

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(request.body))).toMatchObject({ engine: 'mysql', port: 3306 })
  })

  it('rejects unknown server engine values', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({ connections: [{ ...mysqlConnection, engine: 'mongodb' }] }, { status: 200 }),
      ),
    )

    await expect(databaseManagerClient.listConnections()).rejects.toThrow(
      'The server returned an invalid response.',
    )
  })

  it('parses honest MySQL database metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(mysqlSnapshot)))

    const snapshot = await databaseManagerClient.getSnapshot(mysqlConnection.id)

    expect(snapshot).toEqual(mysqlSnapshot)
    expect(snapshot.databases[0]).not.toHaveProperty('owner')
    expect(snapshot.databases[0]).not.toHaveProperty('publicConnect')
  })

  it('parses PostgreSQL database metadata as a separate snapshot variant', async () => {
    const postgresSnapshot = {
      capabilities: {
        ...snapshotCapabilities,
        supportsDatabaseOwners: true,
        supportsDefaultPrivileges: true,
        supportsSchemas: true,
      },
      currentUser: 'postgres',
      databases: [{
        allowConnections: true,
        encoding: 'UTF8',
        engine: 'postgresql',
        name: 'app',
        owner: 'postgres',
        publicConnect: true,
        publicTemporary: false,
        sizeBytes: 2048,
      }],
      engine: 'postgresql',
      principals: [{ ...principal, name: 'reader' }],
      serverVersion: '17.5',
    } as const
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(postgresSnapshot)))

    await expect(databaseManagerClient.getSnapshot(mysqlConnection.id)).resolves.toEqual(
      postgresSnapshot,
    )
  })

  it('rejects PostgreSQL-shaped sentinel fields in a MySQL snapshot', async () => {
    const database = mysqlSnapshot.databases[0]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({
        ...mysqlSnapshot,
        databases: [{
          ...database,
          allowConnections: true,
          encoding: database.defaultCharacterSet,
          owner: 'not-applicable',
          publicConnect: false,
          publicTemporary: false,
        }],
      })),
    )

    await expect(databaseManagerClient.getSnapshot(mysqlConnection.id)).rejects.toThrow(
      'The server returned an invalid response.',
    )
  })
})
