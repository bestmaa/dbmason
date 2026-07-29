// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import type { ChangeEvent, FormEvent, MouseEvent } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePrincipalManagement } from '@/features/database-manager/hooks/usePrincipalManagement'
import { principalLifecycleClient } from '@/features/database-manager/services/principalLifecycleClient'
import type { PrincipalAccessInventory } from '@/modules/database-manager/domain/contracts'

vi.mock('@/features/database-manager/services/principalLifecycleClient', () => ({
  principalLifecycleClient: {
    drop: vi.fn(),
    getAccess: vi.fn(),
    revokeAccess: vi.fn(),
    rotatePassword: vi.fn(),
    setAccess: vi.fn(),
    setLogin: vi.fn(),
  },
}))

const inventory = {
  databases: [
    {
      database: 'app',
      directPreset: 'write',
      effectivePreset: 'write',
      potentialPreset: 'write',
      sources: ['direct'],
    },
    {
      database: 'public_db',
      directPreset: 'none',
      effectivePreset: 'connect',
      potentialPreset: 'connect',
      sources: ['public'],
    },
  ],
  observedAt: '2026-07-29T00:00:00.000Z',
  principal: 'reader',
  truncated: false,
} as const

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe('principal management current access inventory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(principalLifecycleClient.getAccess).mockResolvedValue(inventory)
  })

  it('loads live status, prefills an exact preset, and protects a PUBLIC-only row', async () => {
    const { result } = renderHook(() =>
      usePrincipalManagement({
        accessLevels: ['connect', 'read', 'write', 'developer'],
        canManage: true,
        connectionId: '6aa569ad-6d52-43d2-a2ae-57df7d213d97',
        databases: [
          {
            allowConnections: true,
            encoding: 'UTF8',
            engine: 'postgresql',
            name: 'app',
            owner: 'postgres',
            publicConnect: false,
            publicTemporary: false,
            sizeBytes: 1,
          },
          {
            allowConnections: true,
            encoding: 'UTF8',
            engine: 'postgresql',
            name: 'public_db',
            owner: 'postgres',
            publicConnect: true,
            publicTemporary: false,
            sizeBytes: 1,
          },
        ],
        onCredential: vi.fn(),
        onRefresh: vi.fn(),
        principals: [{
          authenticationUsername: 'reader',
          canCreateDatabase: false,
          canCreateRole: false,
          canLogin: true,
          isSuperuser: false,
          managementDisabledReason: null,
          memberships: [],
          name: 'reader',
          validUntil: null,
        }],
      }),
    )

    act(() => {
      result.current.actions.manage({
        currentTarget: { dataset: { principalName: 'reader' } },
      } as unknown as MouseEvent<HTMLButtonElement>)
    })
    await waitFor(() => expect(result.current.model.accessInventoryLoading).toBe(false))

    expect(result.current.model.accessForm).toEqual({ database: 'app', level: 'write' })
    expect(result.current.model.currentAccess).toMatchObject({ directPreset: 'write' })
    expect(result.current.model.canRevokeCurrentAccess).toBe(true)

    act(() => {
      result.current.actions.onDatabaseChange({
        target: { value: 'public_db' },
      } as unknown as ChangeEvent<HTMLSelectElement>)
    })

    expect(result.current.model.currentAccess).toMatchObject({
      directPreset: 'none',
      effectivePreset: 'connect',
      sources: ['public'],
    })
    expect(result.current.model.canRevokeCurrentAccess).toBe(false)
  })

  it('lets a viewer open the live inventory without exposing mutation actions', async () => {
    const { result } = renderHook(() =>
      usePrincipalManagement({
        accessLevels: ['connect', 'read', 'write', 'developer'],
        canManage: false,
        connectionId: '6aa569ad-6d52-43d2-a2ae-57df7d213d97',
        databases: [{
          allowConnections: true,
          encoding: 'UTF8',
          engine: 'postgresql',
          name: 'app',
          owner: 'postgres',
          publicConnect: false,
          publicTemporary: false,
          sizeBytes: 1,
        }],
        onCredential: vi.fn(),
        onRefresh: vi.fn(),
        principals: [{
          authenticationUsername: 'reader',
          canCreateDatabase: false,
          canCreateRole: false,
          canLogin: true,
          isSuperuser: false,
          managementDisabledReason: null,
          memberships: [],
          name: 'reader',
          validUntil: null,
        }],
      }),
    )

    act(() => {
      result.current.actions.manage({
        currentTarget: { dataset: { principalName: 'reader' } },
      } as unknown as MouseEvent<HTMLButtonElement>)
    })
    await waitFor(() => expect(result.current.model.accessInventoryLoading).toBe(false))

    expect(principalLifecycleClient.getAccess).toHaveBeenCalledOnce()
    expect(result.current.model.principal?.name).toBe('reader')
    expect(result.current.model.canMutate).toBe(false)
  })

  it('aborts and clears stale inventory when the managed connection changes', async () => {
    const first = deferred<PrincipalAccessInventory>()
    const second = deferred<PrincipalAccessInventory>()
    vi.mocked(principalLifecycleClient.getAccess)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const databases = [{
      allowConnections: true,
      encoding: 'UTF8',
      engine: 'postgresql' as const,
      name: 'app',
      owner: 'postgres',
      publicConnect: false,
      publicTemporary: false,
      sizeBytes: 1,
    }]
    const principals = [{
      authenticationUsername: 'reader',
      canCreateDatabase: false,
      canCreateRole: false,
      canLogin: true,
      isSuperuser: false,
      managementDisabledReason: null,
      memberships: [],
      name: 'reader',
      validUntil: null,
    }]
    const { rerender, result } = renderHook(
      ({ connectionId }: { connectionId: string }) =>
        usePrincipalManagement({
          accessLevels: ['connect', 'read', 'write', 'developer'],
          canManage: true,
          connectionId,
          databases,
          onCredential: vi.fn(),
          onRefresh: vi.fn(),
          principals,
        }),
      { initialProps: { connectionId: 'first-connection' } },
    )

    act(() => {
      result.current.actions.manage({
        currentTarget: { dataset: { principalName: 'reader' } },
      } as unknown as MouseEvent<HTMLButtonElement>)
    })
    await waitFor(() => expect(principalLifecycleClient.getAccess).toHaveBeenCalledOnce())

    rerender({ connectionId: 'second-connection' })
    await waitFor(() => expect(result.current.model.principal).toBeNull())
    await act(async () => {
      first.resolve(inventory)
      await first.promise
    })
    expect(result.current.model.accessInventory).toEqual([])

    act(() => {
      result.current.actions.manage({
        currentTarget: { dataset: { principalName: 'reader' } },
      } as unknown as MouseEvent<HTMLButtonElement>)
    })
    await waitFor(() => expect(principalLifecycleClient.getAccess).toHaveBeenCalledTimes(2))
    act(() => {
      second.resolve({
        ...inventory,
        databases: [{
          database: 'app',
          directPreset: 'developer',
          effectivePreset: 'developer',
          potentialPreset: 'developer',
          sources: ['direct'],
        }],
      })
    })
    await waitFor(() =>
      expect(result.current.model.accessForm).toEqual({
        database: 'app',
        level: 'developer',
      }),
    )
  })

  it('ignores stale post-mutation UI work after switching connections', async () => {
    const mutation = deferred<readonly string[]>()
    vi.mocked(principalLifecycleClient.setAccess).mockReturnValue(mutation.promise)
    const nextInventory = {
      ...inventory,
      databases: [{
        database: 'app',
        directPreset: 'developer',
        effectivePreset: 'developer',
        potentialPreset: 'developer',
        sources: ['direct'],
      }],
    } as const
    const input = {
      accessLevels: ['connect', 'read', 'write', 'developer'] as const,
      canManage: true,
      databases: [{
        allowConnections: true,
        encoding: 'UTF8',
        engine: 'postgresql' as const,
        name: 'app',
        owner: 'postgres',
        publicConnect: false,
        publicTemporary: false,
        sizeBytes: 1,
      }],
      onCredential: vi.fn(),
      onRefresh: vi.fn(),
      principals: [{
        authenticationUsername: 'reader',
        canCreateDatabase: false,
        canCreateRole: false,
        canLogin: true,
        isSuperuser: false,
        managementDisabledReason: null,
        memberships: [],
        name: 'reader',
        validUntil: null,
      }],
    }
    const { rerender, result } = renderHook(
      ({ connectionId }: { connectionId: string }) =>
        usePrincipalManagement({ ...input, connectionId }),
      { initialProps: { connectionId: 'first-connection' } },
    )
    act(() => {
      result.current.actions.manage({
        currentTarget: { dataset: { principalName: 'reader' } },
      } as unknown as MouseEvent<HTMLButtonElement>)
    })
    await waitFor(() => expect(result.current.model.accessForm.level).toBe('write'))
    act(() => {
      result.current.actions.onApplyAccess({
        preventDefault: vi.fn(),
      } as unknown as FormEvent<HTMLFormElement>)
    })
    await waitFor(() => expect(principalLifecycleClient.setAccess).toHaveBeenCalledOnce())

    vi.mocked(principalLifecycleClient.getAccess).mockResolvedValue(nextInventory)
    rerender({ connectionId: 'second-connection' })
    await waitFor(() => expect(result.current.model.principal).toBeNull())
    act(() => {
      result.current.actions.manage({
        currentTarget: { dataset: { principalName: 'reader' } },
      } as unknown as MouseEvent<HTMLButtonElement>)
    })
    await waitFor(() => expect(result.current.model.accessForm.level).toBe('developer'))

    await act(async () => {
      mutation.resolve([])
      await mutation.promise
    })
    expect(principalLifecycleClient.getAccess).toHaveBeenCalledTimes(2)
    expect(result.current.model.accessForm.level).toBe('developer')
  })
})
