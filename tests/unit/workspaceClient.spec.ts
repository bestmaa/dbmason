import { afterEach, describe, expect, it, vi } from 'vitest'

import { workspaceClient } from '@/features/database-manager/services/workspaceClient'

describe('workspace browser client validation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejects malformed query cells instead of trusting external JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          columns: [{ dataTypeId: 25, name: 'unsafe' }],
          durationMs: 1,
          rowCount: 1,
          rows: [[{ nested: 'not a supported cell' }]],
          truncated: false,
          truncatedCells: false,
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      workspaceClient.runReadOnlyQuery('connection-id', {
        database: 'app',
        maxRows: 200,
        password: 'transient-test-password',
        principal: 'app_reader',
        sql: 'SELECT 1',
      }),
    ).rejects.toThrow('The server returned an invalid response.')

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('transient-test-password')
    expect(request.method).toBe('POST')
    expect(request.body).toContain('transient-test-password')
  })

  it('rejects a malformed catalog relation kind', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            database: 'app',
            relations: [
              {
                estimatedRows: '1',
                kind: 'unsafe-relation-kind',
                name: 'items',
                schema: 'public',
                sizeBytes: '8192',
              },
            ],
            truncated: false,
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      ),
    )

    await expect(
      workspaceClient.loadCatalog('connection-id', {
        database: 'app',
        password: 'transient-test-password',
        principal: 'app_reader',
      }),
    ).rejects.toThrow('The server returned an invalid response.')
  })
})
