import type { PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AppRole } from '@/access/appRoles'
import { managerService } from '@/modules/database-manager/application/managerService'
import type { PrincipalAccessInventory } from '@/modules/database-manager/domain/contracts'
import { resourceEndpoints } from '@/modules/database-manager/transport/resourceEndpoints'

const endpoint = resourceEndpoints.find(
  ({ method, path }) =>
    method === 'get' &&
    path === '/db-manager/v1/connections/:connectionId/principals/:principal/access',
)
if (!endpoint) throw new Error('Principal access inventory endpoint is missing')

const inventory: PrincipalAccessInventory = {
  databases: [{
    database: 'app',
    directPreset: 'read',
    effectivePreset: 'read',
    potentialPreset: 'read',
    sources: ['direct'],
  }],
  observedAt: '2026-07-29T00:00:00.000Z',
  principal: 'reader',
  truncated: false,
}

function request(role: AppRole | null): PayloadRequest {
  return {
    headers: new Headers(),
    routeParams: {
      connectionId: 'fd56e639-7854-4d7d-a075-e4677f179df6',
      principal: 'reader',
    },
    user: role ? { id: 1, roles: [role] } : null,
  } as unknown as PayloadRequest
}

describe('principal access inventory endpoint', () => {
  afterEach(() => vi.restoreAllMocks())

  it('requires authentication before reading remote grants', async () => {
    const inspect = vi.spyOn(managerService, 'getPrincipalAccess')
    const response = await endpoint.handler(request(null))

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(inspect).not.toHaveBeenCalled()
  })

  it.each(['owner', 'admin', 'operator', 'viewer'] as const)(
    'returns coarse secret-free inventory to the %s role',
    async (role) => {
      const inspect = vi.spyOn(managerService, 'getPrincipalAccess').mockResolvedValue(inventory)
      const req = request(role)
      const response = await endpoint.handler(req)
      const body: unknown = await response.json()

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(inspect).toHaveBeenCalledWith(
        req,
        'fd56e639-7854-4d7d-a075-e4677f179df6',
        'reader',
      )
      expect(body).toEqual(inventory)
      expect(JSON.stringify(body)).not.toMatch(/password|secret|acl|grantor|raw/iu)
    },
  )
})
