import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { resolveManagerCapabilities } from '@/features/database-manager/model/managerCapabilities'
import { resolveWorkspaceState } from '@/features/database-manager/model/workspaceState'
import { initialConnectionForm } from '@/features/database-manager/hooks/managerHookSupport'
import { ConnectionRail } from '@/features/database-manager/ui/ConnectionRail'
import { DatabaseTable } from '@/features/database-manager/ui/DatabaseTable'
import { WorkspaceHeader } from '@/features/database-manager/ui/WorkspaceHeader'
import { Modal } from '@/ui/Modal'

const engineCapabilities = {
  accessLevels: ['connect', 'read', 'write', 'developer'] as const,
  canCreateDatabase: true,
  canCreatePrincipal: true,
  supportsDefaultPrivileges: true,
  supportsObservability: true,
  supportsReadOnlyWorkspace: true,
  supportsSchemas: true,
}

describe('database manager frontend authorization', () => {
  it.each(['owner', 'admin', 'operator'] as const)('allows the %s role to operate', (role) => {
    expect(resolveManagerCapabilities([role], engineCapabilities)).toEqual({
      canCreateConnection: true,
      canCreateDatabase: true,
      canCreatePrincipal: true,
      canDeleteConnection: role !== 'operator',
      canManagePrincipals: true,
      canUseWorkspace: true,
      canViewObservability: true,
    })
  })

  it('keeps viewers read-only and hides mutation controls', () => {
    expect(resolveManagerCapabilities(['viewer'], engineCapabilities)).toEqual({
      canCreateConnection: false,
      canCreateDatabase: false,
      canCreatePrincipal: false,
      canDeleteConnection: false,
      canManagePrincipals: false,
      canUseWorkspace: false,
      canViewObservability: true,
    })

    const rail = renderToStaticMarkup(
      createElement(ConnectionRail, {
        canAdd: false,
        connections: [],
        onAdd: () => undefined,
        onSelect: () => undefined,
        selectedId: null,
      }),
    )
    const header = renderToStaticMarkup(
      createElement(WorkspaceHeader, {
        canCreateDatabase: false,
        canCreatePrincipal: false,
        canDeleteConnection: false,
        connection: {
          engine: 'postgresql',
          host: 'localhost',
          id: 'connection-id',
          lastCheckedAt: null,
          lastLatencyMs: null,
          name: 'Test',
          port: 5432,
          serverVersion: null,
          status: 'online',
        },
        loading: false,
        onCreateDatabase: () => undefined,
        onCreatePrincipal: () => undefined,
        onDeleteConnection: () => undefined,
        onRefresh: () => undefined,
      }),
    )

    expect(rail).not.toContain('Add connection')
    expect(header).not.toContain('Create user')
    expect(header).not.toContain('> Database</button>')
    expect(header).toContain('Refresh')
  })

  it('uses certificate verification for new remote connections by default', () => {
    expect(initialConnectionForm.sslMode).toBe('verify-full')
  })

  it('shows inherited PUBLIC database privileges without viewer actions', () => {
    const html = renderToStaticMarkup(
      createElement(DatabaseTable, {
        canBrowse: false,
        databases: [
          {
            allowConnections: true,
            encoding: 'UTF8',
            name: 'app',
            owner: 'postgres',
            publicConnect: true,
            publicTemporary: true,
            sizeBytes: 1024,
          },
        ],
        onBrowse: () => undefined,
      }),
    )

    expect(html).toContain('PUBLIC grants')
    expect(html).toContain('CONNECT')
    expect(html).toContain('TEMPORARY')
    expect(html).not.toContain('Browse app')
  })
})

describe('database manager error presentation', () => {
  it('prioritizes a fatal load error over the empty state', () => {
    expect(
      resolveWorkspaceState({
        error: 'Service unavailable',
        hasConnections: false,
        hasSelectedConnection: false,
        hasSnapshot: false,
        loading: false,
      }),
    ).toBe('error')
  })

  it('renders operation errors inside the active modal', () => {
    const html = renderToStaticMarkup(
      Modal({
        children: createElement('span', null, 'Dialog content'),
        description: 'Test description',
        error: 'Could not create the database.',
        onClose: () => undefined,
        title: 'Test dialog',
      }),
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('Could not create the database.')
    expect(html).toContain('Dialog content')
  })
})
