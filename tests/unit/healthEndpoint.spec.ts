import { describe, expect, it } from 'vitest'

import { createCachedReadinessCheck } from '@/app/api/health/readiness'
import { createHealthResponse } from '@/app/api/health/route'

describe('health endpoint', () => {
  it('reports healthy only after runtime configuration validates', async () => {
    const response = await createHealthResponse(async () => true)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
  })

  it('fails closed without exposing invalid configuration details', async () => {
    const response = await createHealthResponse(async () => {
      throw new Error('secret validation detail')
    })

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ status: 'unhealthy' })
  })

  it('deduplicates concurrent probes and caches their result for the TTL', async () => {
    let finishProbe: (() => void) | undefined
    let probeCalls = 0
    let time = 1_000
    const check = createCachedReadinessCheck(
      () => {
        probeCalls += 1
        return new Promise<void>((resolve) => {
          finishProbe = resolve
        })
      },
      5_000,
      () => time,
    )

    const first = check()
    const concurrent = check()
    expect(probeCalls).toBe(1)
    finishProbe?.()
    await expect(Promise.all([first, concurrent])).resolves.toEqual([true, true])

    time = 5_999
    await expect(check()).resolves.toBe(true)
    expect(probeCalls).toBe(1)

    time = 6_000
    const refreshed = check()
    expect(probeCalls).toBe(2)
    finishProbe?.()
    await expect(refreshed).resolves.toBe(true)
  })

  it('caches probe failure without retaining its error detail', async () => {
    let probeCalls = 0
    const check = createCachedReadinessCheck(async () => {
      probeCalls += 1
      throw new Error('sensitive storage path')
    })

    await expect(check()).resolves.toBe(false)
    await expect(check()).resolves.toBe(false)
    expect(probeCalls).toBe(1)
  })
})
