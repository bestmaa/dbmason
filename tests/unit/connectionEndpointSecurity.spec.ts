import type { PayloadRequest } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppRole } from '@/access/appRoles'
import { managerService } from '@/modules/database-manager/application/managerService'
import type { ConnectionSummary } from '@/modules/database-manager/domain/contracts'
import {
  listConnections,
  updateConnectionExternalEndpoint,
} from '@/modules/database-manager/infrastructure/payload/connectionStore'
import { connectionEndpoints } from '@/modules/database-manager/transport/connectionEndpoints'

const vaultMocks = vi.hoisted(() => ({
  decrypt: vi.fn(),
  encrypt: vi.fn(),
}))

vi.mock('@/modules/database-manager/infrastructure/security/credentialVault', () => ({
  decryptConnectionSecret: vaultMocks.decrypt,
  encryptConnectionSecret: vaultMocks.encrypt,
}))

const summary: ConnectionSummary = {
  engine: 'postgresql',
  externalHost: 'db.example.com',
  externalPort: 6543,
  externalSslMode: 'verify-full',
  host: 'postgres.internal',
  id: '1bb14642-9de4-4244-b948-95655d0195f4',
  lastCheckedAt: null,
  lastLatencyMs: null,
  name: 'Production',
  port: 5432,
  serverVersion: null,
  sslMode: 'verify-full',
  status: 'online',
}

const storedConnection = {
  createdAt: '2026-07-28T10:00:00.000Z',
  createdBy: 1,
  encryptedSecret: 'encrypted-administrator-credential',
  engine: 'postgresql',
  externalHost: 'db.example.com',
  externalPort: 6543,
  externalSslMode: 'verify-full',
  host: 'postgres.internal',
  id: 7,
  lastCheckedAt: null,
  lastLatencyMs: null,
  maintenanceDatabase: 'postgres',
  name: 'Production',
  port: 5432,
  publicId: summary.id,
  serverVersion: null,
  sslMode: 'verify-full',
  status: 'online',
  updatedAt: '2026-07-28T10:00:00.000Z',
  username: 'root-administrator',
} as const

function endpointRequest(role: AppRole): PayloadRequest {
  return {
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({
      external: {
        host: 'db.example.com',
        port: 6543,
        sslMode: 'verify-full',
      },
    }),
    routeParams: { connectionId: summary.id },
    user: { id: 1, roles: [role] },
  } as unknown as PayloadRequest
}

function storeRequest(role: AppRole, payload: object): PayloadRequest {
  return {
    payload,
    user: { id: 1, roles: [role] },
  } as unknown as PayloadRequest
}

describe('connection endpoint authorization', () => {
  beforeEach(() => vaultMocks.decrypt.mockReset())
  afterEach(() => vi.restoreAllMocks())

  it.each(['operator', 'viewer'] as const)(
    'rejects external endpoint changes from the %s role before service work',
    async (role) => {
      const update = vi.spyOn(managerService, 'updateExternalEndpoint')
      const response = await connectionEndpoints[0]!.handler(endpointRequest(role))

      expect(response.status).toBe(403)
      expect(response.headers.get('cache-control')).toBe('no-store')
      await expect(response.json()).resolves.toEqual({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission for this action.',
        },
      })
      expect(update).not.toHaveBeenCalled()
    },
  )

  it.each(['owner', 'admin'] as const)(
    'allows the %s role to update display-only endpoint metadata',
    async (role) => {
      const update = vi.spyOn(managerService, 'updateExternalEndpoint').mockResolvedValue(summary)
      const req = endpointRequest(role)
      const response = await connectionEndpoints[0]!.handler(req)

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(update).toHaveBeenCalledWith(req, summary.id, {
        external: {
          host: 'db.example.com',
          port: 6543,
          sslMode: 'verify-full',
        },
      })
      await expect(response.json()).resolves.toEqual({ connection: summary })
    },
  )
})

describe('connection summary credential redaction', () => {
  beforeEach(() => vaultMocks.decrypt.mockReset())

  it.each([
    ['owner', 'db.example.com'],
    ['admin', 'db.example.com'],
    ['operator', null],
    ['viewer', null],
  ] as const)(
    'returns a credential-free summary and role-shaped external metadata for %s',
    async (role, expectedExternalHost) => {
      const find = vi.fn().mockResolvedValue({ docs: [storedConnection] })
      const connections = await listConnections(storeRequest(role, { find }))
      const connection = connections[0]

      expect(connection).toMatchObject({
        externalHost: expectedExternalHost,
        id: summary.id,
        name: 'Production',
      })
      expect(connection).not.toHaveProperty('encryptedSecret')
      expect(connection).not.toHaveProperty('maintenanceDatabase')
      expect(connection).not.toHaveProperty('password')
      expect(connection).not.toHaveProperty('username')
      expect(JSON.stringify(connection)).not.toContain('encrypted-administrator-credential')
      expect(JSON.stringify(connection)).not.toContain('root-administrator')
      expect(vaultMocks.decrypt).not.toHaveBeenCalled()
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          overrideAccess: false,
          user: expect.objectContaining({ roles: [role] }),
        }),
      )
    },
  )

  it('updates endpoint metadata without decrypting the saved administrator credential', async () => {
    const update = vi.fn().mockResolvedValue({
      ...storedConnection,
      externalHost: 'new-db.example.com',
      externalPort: 7654,
      externalSslMode: 'require',
    })
    const req = storeRequest('owner', { update })
    const connection = await updateConnectionExternalEndpoint(req, storedConnection, {
      host: 'new-db.example.com',
      port: 7654,
      sslMode: 'require',
    })

    expect(connection).toMatchObject({
      externalHost: 'new-db.example.com',
      externalPort: 7654,
      externalSslMode: 'require',
    })
    expect(connection).not.toHaveProperty('encryptedSecret')
    expect(connection).not.toHaveProperty('username')
    expect(vaultMocks.decrypt).not.toHaveBeenCalled()
  })
})
