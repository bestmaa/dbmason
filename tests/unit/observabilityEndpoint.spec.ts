import type { PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { managerService } from '@/modules/database-manager/application/managerService'
import type { ObservabilitySnapshot } from '@/modules/database-manager/domain/observability'
import { observabilityEndpoints } from '@/modules/database-manager/transport/observabilityEndpoints'

const snapshot: ObservabilitySnapshot = {
  activity: { reason: 'remote-stats-privilege-required', status: 'unavailable' },
  clusterIo: {
    evictions: '0',
    extends: '0',
    fsyncs: '0',
    hits: '0',
    readOperationBytes: '0',
    reads: '0',
    reuses: '0',
    statsResetAt: null,
    timing: { reason: 'tracking-disabled', status: 'unavailable' },
    writeOperationBytes: '0',
    writebacks: '0',
    writes: '0',
  },
  collectionLagHintMs: 1_000,
  connections: {
    configuredMaximum: 100,
    observed: 0,
    regularCapacity: 97,
    reserved: 0,
    superuserReserved: 3,
    utilizationPercent: 0,
  },
  currentDatabase: 'postgres',
  databases: [],
  engine: 'postgresql',
  hostTelemetry: { reason: 'external-provider-required', status: 'unavailable' },
  inRecovery: false,
  longQueryThresholdMs: 5_000,
  sampledAt: '2026-07-20T12:00:00.000Z',
  scope: 'cluster',
  serverStartedAt: '2026-07-20T10:00:00.000Z',
  source: 'postgresql-statistics',
  tracking: { activities: true, counts: true, ioTiming: false },
}

function request(user: unknown): PayloadRequest {
  return {
    routeParams: { connectionId: 'connection-id' },
    user,
  } as unknown as PayloadRequest
}

describe('observability endpoint', () => {
  afterEach(() => vi.restoreAllMocks())

  it('requires authentication before loading encrypted connection data', async () => {
    const service = vi.spyOn(managerService, 'getObservability')
    const response = await observabilityEndpoints[0]!.handler(request(null))

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(service).not.toHaveBeenCalled()
  })

  it('returns the raw snapshot with no-store caching', async () => {
    vi.spyOn(managerService, 'getObservability').mockResolvedValue(snapshot)
    const response = await observabilityEndpoints[0]!.handler(request({ id: 1 }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual(snapshot)
  })
})
