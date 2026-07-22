import { describe, expect, it, vi } from 'vitest'

import {
  OperationLimiter,
  PostgresCapacityError,
} from '@/modules/database-manager/infrastructure/postgresql/operationLimiter'

describe('OperationLimiter', () => {
  it('hands a released slot to the next bounded waiter', async () => {
    const limiter = new OperationLimiter(1, 1, 1_000)
    const releaseFirst = await limiter.acquire()
    const waiting = limiter.acquire()

    releaseFirst()
    const releaseSecond = await waiting
    expect(releaseSecond).toBeTypeOf('function')
    releaseSecond()
  })

  it('rejects work when the bounded queue is already full', async () => {
    const limiter = new OperationLimiter(1, 1, 1_000)
    const release = await limiter.acquire()
    const waiting = limiter.acquire()

    await expect(limiter.acquire()).rejects.toBeInstanceOf(PostgresCapacityError)
    release()
    ;(await waiting)()
  })

  it('expires queued work instead of retaining it indefinitely', async () => {
    vi.useFakeTimers()
    const limiter = new OperationLimiter(1, 1, 50)
    const release = await limiter.acquire()
    const waiting = limiter.acquire()
    const rejection = expect(waiting).rejects.toBeInstanceOf(PostgresCapacityError)

    await vi.advanceTimersByTimeAsync(50)
    await rejection
    release()
    const releaseAfterExpiry = await limiter.acquire()
    expect(releaseAfterExpiry).toBeTypeOf('function')
    releaseAfterExpiry()
    vi.useRealTimers()
  })
})
