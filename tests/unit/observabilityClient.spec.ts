import { afterEach, describe, expect, it, vi } from 'vitest'

import { observabilityClient } from '@/features/database-manager/services/observabilityClient'

import { observabilityFixture } from './observabilityFixture'

describe('observability browser client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('parses the typed no-store endpoint response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(observabilityFixture()), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await observabilityClient.getSnapshot('connection/id')

    expect(result.engine).toBe('postgresql')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/db-manager/v1/connections/connection%2Fid/observability',
      expect.objectContaining({ headers: expect.any(Headers) }),
    )
  })

  it('rejects malformed decimal counters from the server', async () => {
    const invalid = observabilityFixture()
    invalid.databases[0]!.transactionsCommitted = '12.5'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(invalid), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      ),
    )

    await expect(observabilityClient.getSnapshot('connection-id')).rejects.toThrow(
      'The server returned an invalid response.',
    )
  })
})
