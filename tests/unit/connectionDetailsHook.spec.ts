// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ChangeEvent, FormEvent, MouseEvent } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useConnectionDetails } from '@/features/database-manager/hooks/useConnectionDetails'
import type {
  ConnectionSummary,
  PrincipalSummary,
} from '@/modules/database-manager/domain/contracts'

const mocks = vi.hoisted(() => ({
  copy: vi.fn(),
  updateExternalEndpoint: vi.fn(),
}))

vi.mock('@/features/database-manager/services/clipboardClient', () => ({
  clipboardClient: { copy: mocks.copy },
}))

vi.mock('@/features/database-manager/services/databaseManagerClient', () => ({
  databaseManagerClient: {
    updateExternalEndpoint: mocks.updateExternalEndpoint,
  },
}))

const connection: ConnectionSummary = {
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

const principals: readonly PrincipalSummary[] = [
  {
    authenticationUsername: 'reader',
    canCreateDatabase: false,
    canCreateRole: false,
    canLogin: true,
    isSuperuser: false,
    memberships: [],
    name: 'reader',
    validUntil: null,
  },
]

function inputEvent(value: string): ChangeEvent<HTMLInputElement> {
  return { target: { value } } as unknown as ChangeEvent<HTMLInputElement>
}

function selectEvent(value: string): ChangeEvent<HTMLSelectElement> {
  return { target: { value } } as unknown as ChangeEvent<HTMLSelectElement>
}

function formEvent(): FormEvent<HTMLFormElement> {
  return { preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>
}

function databaseEvent(database: string): MouseEvent<HTMLButtonElement> {
  return {
    currentTarget: { dataset: { database } },
  } as unknown as MouseEvent<HTMLButtonElement>
}

function renderDetails(onConnectionUpdated = vi.fn()) {
  return {
    onConnectionUpdated,
    ...renderHook(() =>
      useConnectionDetails({
        canEditExternal: true,
        connection,
        currentUser: 'postgres',
        onConnectionUpdated,
        principals,
      }),
    ),
  }
}

describe('transient connection-details credentials', () => {
  beforeEach(() => {
    mocks.copy.mockReset().mockResolvedValue(undefined)
    mocks.updateExternalEndpoint.mockReset()
  })

  afterEach(() => cleanup())

  it('clears the password whenever endpoint identity or dialog scope changes', () => {
    const { result } = renderDetails()
    act(() => result.current.actions.openDatabase(databaseEvent('app')))

    act(() => result.current.actions.onPasswordChange(inputEvent('reader-secret')))
    act(() => result.current.actions.onExternalHostChange(inputEvent('new-db.example.com')))
    expect(result.current.model.password).toBe('')

    act(() => result.current.actions.onPasswordChange(inputEvent('reader-secret')))
    act(() => result.current.actions.onExternalPortChange(inputEvent('7654')))
    expect(result.current.model.password).toBe('')

    act(() => result.current.actions.onPasswordChange(inputEvent('reader-secret')))
    act(() => result.current.actions.onExternalSslModeChange(selectEvent('require')))
    expect(result.current.model.password).toBe('')

    act(() => result.current.actions.onPasswordChange(inputEvent('reader-secret')))
    act(() => result.current.actions.onPrincipalChange(selectEvent('reader')))
    expect(result.current.model.password).toBe('')

    act(() => result.current.actions.onPasswordChange(inputEvent('reader-secret')))
    act(() => result.current.actions.close())
    expect(result.current.model.open).toBe(false)
    expect(result.current.model.password).toBe('')
  })

  it('clears the password after successful endpoint save and clear operations', async () => {
    mocks.updateExternalEndpoint
      .mockResolvedValueOnce({
        ...connection,
        externalHost: 'new-db.example.com',
        externalPort: 7654,
        externalSslMode: 'require',
      })
      .mockResolvedValueOnce({
        ...connection,
        externalHost: null,
        externalPort: null,
        externalSslMode: null,
      })
    const { onConnectionUpdated, result } = renderDetails()
    act(() => result.current.actions.openDatabase(databaseEvent('app')))
    act(() => {
      result.current.actions.onExternalHostChange(inputEvent('new-db.example.com'))
      result.current.actions.onExternalPortChange(inputEvent('7654'))
      result.current.actions.onExternalSslModeChange(selectEvent('require'))
    })
    act(() => {
      result.current.actions.onPasswordChange(inputEvent('reader-secret'))
    })
    act(() => {
      result.current.actions.saveExternal(formEvent())
    })

    await waitFor(() => expect(onConnectionUpdated).toHaveBeenCalledTimes(1))
    expect(result.current.model.password).toBe('')

    act(() => {
      result.current.actions.onPasswordChange(inputEvent('another-secret'))
      result.current.actions.clearExternal()
    })

    await waitFor(() => expect(onConnectionUpdated).toHaveBeenCalledTimes(2))
    expect(result.current.model.password).toBe('')
  })

  it('copies complete URLs only through the clipboard service boundary', async () => {
    const { result } = renderDetails()
    act(() => result.current.actions.openDatabase(databaseEvent('customer data')))
    act(() => result.current.actions.onPasswordChange(inputEvent('p@ss word')))
    act(() => result.current.actions.copyInternal())

    await waitFor(() => {
      expect(mocks.copy).toHaveBeenCalledWith(
        'postgresql://reader:p%40ss%20word@postgres.internal:5432/customer%20data?sslmode=verify-full',
      )
      expect(result.current.model.copied).toBe('Internal URL copied.')
    })
  })
})
