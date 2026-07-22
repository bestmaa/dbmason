// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDatabaseWorkspace } from '@/features/database-manager/hooks/useDatabaseWorkspace'
import { useResourceCreation } from '@/features/database-manager/hooks/useResourceCreation'
import { connectionFormForEngine } from '@/features/database-manager/hooks/managerHookSupport'
import { engineOptions, enginePresentation } from '@/features/database-manager/model/enginePresentation'
import type { ManagerActions } from '@/features/database-manager/model/viewModels'
import { ConnectionDialog } from '@/features/database-manager/ui/dialogs/ConnectionDialog'

const mocks = vi.hoisted(() => ({
  createConnection: vi.fn(),
  loadCatalog: vi.fn(),
}))

vi.mock('@/features/database-manager/services/databaseManagerClient', () => ({
  databaseManagerClient: {
    createConnection: mocks.createConnection,
    createDatabase: vi.fn(),
    createPrincipal: vi.fn(),
  },
}))

vi.mock('@/features/database-manager/services/workspaceClient', () => ({
  workspaceClient: {
    browseRelation: vi.fn(),
    loadCatalog: mocks.loadCatalog,
    runReadOnlyQuery: vi.fn(),
  },
}))

vi.mock('@/features/database-manager/services/clipboardClient', () => ({
  clipboardClient: { copy: vi.fn() },
}))

function inputEvent(value: string): ChangeEvent<HTMLInputElement> {
  return { target: { value } } as unknown as ChangeEvent<HTMLInputElement>
}

function selectEvent(value: string): ChangeEvent<HTMLSelectElement> {
  return { target: { value } } as unknown as ChangeEvent<HTMLSelectElement>
}

function formEvent(): FormEvent<HTMLFormElement> {
  return { preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>
}

const capabilities = {
  canCreateConnection: true,
  canCreateDatabase: true,
  canCreatePrincipal: true,
  canDeleteConnection: true,
  canManagePrincipals: true,
  canUseWorkspace: true,
  canViewObservability: true,
}

function connectionActions(): ManagerActions['connectionForm'] {
  return {
    onEngineChange: () => undefined,
    onHostChange: () => undefined,
    onMaintenanceDatabaseChange: () => undefined,
    onNameChange: () => undefined,
    onPasswordChange: () => undefined,
    onPortChange: () => undefined,
    onSslModeChange: () => undefined,
    onSubmit: () => undefined,
    onUsernameChange: () => undefined,
  }
}

describe('remote administrator credential hygiene', () => {
  afterEach(() => {
    cleanup()
    mocks.createConnection.mockReset()
    mocks.loadCatalog.mockReset()
  })

  it('does not identify remote credentials as the DBMason origin login', () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionDialog, {
        actions: connectionActions(),
        engineOptions,
        error: null,
        onClose: () => undefined,
        presentation: enginePresentation('postgresql'),
        submitting: false,
        value: connectionFormForEngine('postgresql'),
      }),
    )

    expect(html).toContain('autoComplete="new-password"')
    expect(html).toContain('<form autoComplete="off"')
    expect(html).not.toContain('autoComplete="current-password"')
    expect(html).not.toContain('autoComplete="username"')
  })

  it('clears the password on engine switch, cancel, and failed submit', async () => {
    mocks.createConnection.mockRejectedValueOnce(new Error('Connection failed.'))
    const { result } = renderHook(() =>
      useResourceCreation({
        accessLevels: ['read'],
        capabilities,
        onConnectionCreated: () => undefined,
        onRefresh: () => undefined,
        selectedConnectionId: 'connection-id',
        supportsDatabaseOwners: true,
      }),
    )

    act(() => {
      result.current.actions.openConnectionDialog()
      result.current.actions.connectionForm.onNameChange(inputEvent('Private server'))
      result.current.actions.connectionForm.onPasswordChange(inputEvent('admin-secret'))
      result.current.actions.connectionForm.onEngineChange(selectEvent('mysql'))
    })
    expect(result.current.model.connectionForm).toMatchObject({
      engine: 'mysql',
      name: 'Private server',
      password: '',
      port: '3306',
      username: 'root',
    })

    act(() => {
      result.current.actions.connectionForm.onPasswordChange(inputEvent('second-secret'))
      result.current.actions.closeDialog()
    })
    expect(result.current.model.connectionForm).toEqual(connectionFormForEngine('mysql'))

    act(() => {
      result.current.actions.openConnectionDialog()
      result.current.actions.connectionForm.onPasswordChange(inputEvent('third-secret'))
      result.current.actions.connectionForm.onSubmit(formEvent())
    })
    await waitFor(() => expect(result.current.model.dialogError).toBe('Connection failed.'))
    expect(result.current.model.connectionForm.password).toBe('')
  })

  it('forgets a generated one-time password when its dialog closes', () => {
    const { result } = renderHook(() =>
      useResourceCreation({
        accessLevels: ['read'],
        capabilities,
        onConnectionCreated: () => undefined,
        onRefresh: () => undefined,
        selectedConnectionId: 'connection-id',
        supportsDatabaseOwners: true,
      }),
    )
    act(() => result.current.showCredential({
      oneTimePassword: 'one-time-secret',
      principal: 'reader',
      warnings: [],
    }))
    expect(result.current.model.credential?.oneTimePassword).toBe('one-time-secret')

    act(() => result.current.actions.closeDialog())

    expect(result.current.model.credential).toBeNull()
  })

  it('resets all administrator form state after a successful save', async () => {
    const onConnectionCreated = vi.fn()
    mocks.createConnection.mockResolvedValueOnce({
      engine: 'postgresql',
      host: 'db.internal',
      id: 'connection-id',
      lastCheckedAt: null,
      lastLatencyMs: null,
      name: 'Private server',
      port: 5432,
      serverVersion: '17.5',
      status: 'online',
    })
    const { result } = renderHook(() =>
      useResourceCreation({
        accessLevels: ['read'],
        capabilities,
        onConnectionCreated,
        onRefresh: () => undefined,
        selectedConnectionId: null,
        supportsDatabaseOwners: true,
      }),
    )
    act(() => {
      result.current.actions.openConnectionDialog()
      result.current.actions.connectionForm.onNameChange(inputEvent('Private server'))
      result.current.actions.connectionForm.onHostChange(inputEvent('db.internal'))
      result.current.actions.connectionForm.onPasswordChange(inputEvent('admin-secret'))
    })
    act(() => {
      result.current.actions.connectionForm.onSubmit(formEvent())
    })

    await waitFor(() => expect(onConnectionCreated).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(result.current.model.connectionForm).toEqual(connectionFormForEngine('postgresql'))
      expect(result.current.model.openDialog).toBeNull()
    })
  })
})

describe('transient workspace credential parity', () => {
  const input = {
    connectionId: 'connection-id',
    currentUser: 'root@%',
    databases: [
      { defaultCharacterSet: 'utf8mb4', defaultCollation: 'utf8mb4_0900_ai_ci', engine: 'mysql' as const, name: 'app', sizeBytes: 0 },
      { defaultCharacterSet: 'utf8mb4', defaultCollation: 'utf8mb4_0900_ai_ci', engine: 'mysql' as const, name: 'other', sizeBytes: 0 },
    ],
    engine: 'mysql' as const,
    principals: [{ canCreateDatabase: false, canCreateRole: false, canLogin: true, isSuperuser: false, memberships: [], name: 'reader@%', validUntil: null }],
  }

  it('clears the transient password when identity scope changes', () => {
    const { result } = renderHook(() => useDatabaseWorkspace(input))
    act(() => result.current.actions.onPasswordChange(inputEvent('workspace-secret')))
    act(() => result.current.actions.onDatabaseChange(selectEvent('other')))
    expect(result.current.model.credential.password).toBe('')

    act(() => result.current.actions.onPasswordChange(inputEvent('workspace-secret')))
    act(() => result.current.selectDatabase('app'))
    expect(result.current.model.credential.password).toBe('')

    act(() => result.current.actions.onPasswordChange(inputEvent('workspace-secret')))
    act(() => result.current.actions.disconnect())
    expect(result.current.model.credential.password).toBe('')
  })

  it('clears a rejected transient password after connection attempt', async () => {
    mocks.loadCatalog.mockRejectedValueOnce(new Error('Access denied.'))
    const { result } = renderHook(() => useDatabaseWorkspace(input))
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)))
    act(() => result.current.actions.onPasswordChange(inputEvent('wrong-secret')))
    act(() => result.current.actions.connect(formEvent()))

    await waitFor(() => expect(result.current.model.error).toBe('Access denied.'))
    expect(result.current.model.credential.password).toBe('')
  })
})
