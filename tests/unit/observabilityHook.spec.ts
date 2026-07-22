// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ObservabilitySnapshot } from '@/modules/database-manager/domain/observability'
import type { EngineId } from '@/modules/database-manager/domain/contracts'

import { useObservability } from '@/features/database-manager/hooks/useObservability'

import { observabilityFixture } from './observabilityFixture'

const mocks = vi.hoisted(() => ({ getSnapshot: vi.fn() }))

vi.mock('@/features/database-manager/services/observabilityClient', () => ({
  observabilityClient: { getSnapshot: mocks.getSnapshot },
}))

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

interface HookInput {
  connectionId: string | null
  enabled: boolean
  engine: EngineId | null
}

describe('useObservability', () => {
  afterEach(() => {
    cleanup()
    mocks.getSnapshot.mockReset()
  })

  it('loads only when opened and preserves the current snapshot during refresh', async () => {
    mocks.getSnapshot.mockResolvedValueOnce(observabilityFixture())
    const { result, rerender } = renderHook(
      (input: HookInput) => useObservability(input),
      { initialProps: { connectionId: 'one', enabled: false, engine: 'postgresql' } },
    )

    expect(mocks.getSnapshot).not.toHaveBeenCalled()
    rerender({ connectionId: 'one', enabled: true, engine: 'postgresql' })
    await waitFor(() => expect(result.current.model.state).toBe('ready'))

    const next = deferred<ObservabilitySnapshot>()
    mocks.getSnapshot.mockReturnValueOnce(next.promise)
    act(() => result.current.actions.refresh())
    await waitFor(() => expect(result.current.model.refreshing).toBe(true))
    expect(result.current.model.metrics[0]?.value).toBe('12 / 100')

    act(() => next.resolve(observabilityFixture({ sampledAt: '2026-07-20T12:01:00.000Z' })))
    await waitFor(() => expect(result.current.model.refreshing).toBe(false))
    expect(result.current.model.sampledAtLabel).toBe('2026-07-20 12:01:00 UTC')
  })

  it('aborts the old request and hides its data when the connection changes', async () => {
    const first = deferred<ObservabilitySnapshot>()
    const second = deferred<ObservabilitySnapshot>()
    mocks.getSnapshot.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result, rerender } = renderHook(
      (input: HookInput) => useObservability(input),
      { initialProps: { connectionId: 'one', enabled: true, engine: 'postgresql' } },
    )
    await waitFor(() => expect(mocks.getSnapshot).toHaveBeenCalledTimes(1))
    const firstSignal = mocks.getSnapshot.mock.calls[0]?.[1] as AbortSignal

    rerender({ connectionId: 'two', enabled: true, engine: 'postgresql' })
    await waitFor(() => expect(mocks.getSnapshot).toHaveBeenCalledTimes(2))
    expect(firstSignal.aborted).toBe(true)
    expect(result.current.model.state).toBe('loading')
    expect(result.current.model.metrics).toHaveLength(0)

    act(() => second.resolve(observabilityFixture({ currentDatabase: 'second' })))
    await waitFor(() => expect(result.current.model.state).toBe('ready'))
  })
})
