import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { resolveManagerCapabilities } from '@/features/database-manager/model/managerCapabilities'
import { resolveWorkspaceState } from '@/features/database-manager/model/workspaceState'
import {
  connectionFormForEngine,
  initialConnectionForm,
  parseEngineId,
} from '@/features/database-manager/hooks/managerHookSupport'
import { engineLabels } from '@/features/database-manager/model/enginePresentation'
import { buildDatabaseTableViewModel } from '@/features/database-manager/model/databaseResources'
import { ConnectionRail } from '@/features/database-manager/ui/ConnectionRail'
import { DatabaseTable } from '@/features/database-manager/ui/DatabaseTable'
import { SignOutButton } from '@/features/database-manager/ui/SignOutButton'
import { WorkspaceHeader } from '@/features/database-manager/ui/WorkspaceHeader'
import { Modal } from '@/ui/Modal'

const engineCapabilities = {
  accessLevels: ['connect', 'read', 'write', 'developer'] as const,
  canCreateDatabase: true,
  canCreatePrincipal: true,
  supportsDatabaseOwners: true,
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
      canViewConnectionDetails: role !== 'operator',
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
      canViewConnectionDetails: false,
      canViewObservability: true,
    })

    const rail = renderToStaticMarkup(
      createElement(ConnectionRail, {
        canAdd: false,
        canDelete: false,
        connections: [],
        engineLabels,
        onAdd: () => undefined,
        onRemove: () => undefined,
        onSelect: () => undefined,
        productName: 'DBMason',
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
          externalHost: null,
          externalPort: null,
          externalSslMode: null,
          host: 'localhost',
          id: 'connection-id',
          lastCheckedAt: null,
          lastLatencyMs: null,
          name: 'Test',
          port: 5432,
          serverVersion: null,
          sslMode: 'verify-full',
          status: 'online',
        },
        engineLabel: 'PostgreSQL',
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

  it('shows an explicit per-connection removal action only to connection administrators', () => {
    const connection = {
      engine: 'postgresql' as const,
      externalHost: null,
      externalPort: null,
      externalSslMode: null,
      host: 'postgres.internal',
      id: 'd75b3975-9377-497b-9349-5ef373d85bbc',
      lastCheckedAt: null,
      lastLatencyMs: null,
      name: 'Production Database',
      port: 5432,
      serverVersion: null,
      sslMode: 'verify-full' as const,
      status: 'online' as const,
    }
    const renderRail = (canDelete: boolean) =>
      renderToStaticMarkup(
        createElement(ConnectionRail, {
          canAdd: false,
          canDelete,
          connections: [connection],
          engineLabels,
          onAdd: () => undefined,
          onRemove: () => undefined,
          onSelect: () => undefined,
          productName: 'DBMason',
          selectedId: connection.id,
        }),
      )

    expect(renderRail(true)).toContain('aria-label="Remove saved connection Production Database"')
    expect(renderRail(false)).not.toContain('Remove saved connection Production Database')
  })

  it('uses certificate verification for new remote connections by default', () => {
    expect(initialConnectionForm.sslMode).toBe('verify-full')
  })

  it('switches to explicit MySQL administrator defaults without widening engine input', () => {
    expect(connectionFormForEngine('mysql')).toMatchObject({
      engine: 'mysql',
      maintenanceDatabase: 'mysql',
      port: '3306',
      username: 'root',
    })
    expect(parseEngineId('mysql')).toBe('mysql')
    expect(parseEngineId('mongodb')).toBeNull()
  })

  it('shows inherited PUBLIC database privileges without viewer actions', () => {
    const html = renderToStaticMarkup(
      createElement(DatabaseTable, {
        canBrowse: false,
        canViewDetails: false,
        model: buildDatabaseTableViewModel('postgresql', [
          {
            allowConnections: true,
            encoding: 'UTF8',
            engine: 'postgresql',
            name: 'app',
            owner: 'postgres',
            publicConnect: true,
            publicTemporary: true,
            sizeBytes: 1024,
          },
        ]),
        onBrowse: () => undefined,
        onDetails: () => undefined,
      }),
    )

    expect(html).toContain('PUBLIC grants')
    expect(html).toContain('CONNECT')
    expect(html).toContain('TEMPORARY')
    expect(html).not.toContain('Browse app')
    expect(html).not.toContain('Connection details for app')
  })

  it.each(['owner', 'admin', 'operator', 'viewer'] as const)(
    'shows connection details to the %s role only when it administers saved connections',
    (role) => {
      const capabilities = resolveManagerCapabilities([role], engineCapabilities)
      const html = renderToStaticMarkup(
        createElement(DatabaseTable, {
          canBrowse: capabilities.canUseWorkspace,
          canViewDetails: capabilities.canViewConnectionDetails,
          model: buildDatabaseTableViewModel('postgresql', [
            {
              allowConnections: true,
              encoding: 'UTF8',
              engine: 'postgresql',
              name: 'app',
              owner: 'postgres',
              publicConnect: false,
              publicTemporary: false,
              sizeBytes: 1024,
            },
          ]),
          onBrowse: () => undefined,
          onDetails: () => undefined,
        }),
      )

      if (role === 'owner' || role === 'admin') {
        expect(html).toContain('aria-label="Connection details for app"')
      } else {
        expect(html).not.toContain('Connection details for app')
      }
    },
  )

  it('does not let an operator use workspace permission as details permission', () => {
    const capabilities = resolveManagerCapabilities(['operator'], engineCapabilities)
    expect(capabilities.canUseWorkspace).toBe(true)
    expect(capabilities.canViewConnectionDetails).toBe(false)
  })

  it('renders MySQL identity without PostgreSQL-only owner or PUBLIC columns', () => {
    const header = renderToStaticMarkup(
      createElement(WorkspaceHeader, {
        canCreateDatabase: true,
        canCreatePrincipal: true,
        canDeleteConnection: false,
        connection: {
          engine: 'mysql',
          externalHost: null,
          externalPort: null,
          externalSslMode: null,
          host: 'mysql.internal',
          id: 'mysql-id',
          lastCheckedAt: null,
          lastLatencyMs: null,
          name: 'MySQL test',
          port: 3306,
          serverVersion: '8.4.6',
          sslMode: 'verify-full',
          status: 'online',
        },
        engineLabel: 'MySQL',
        loading: false,
        onCreateDatabase: () => undefined,
        onCreatePrincipal: () => undefined,
        onDeleteConnection: () => undefined,
        onRefresh: () => undefined,
      }),
    )
    const table = renderToStaticMarkup(
      createElement(DatabaseTable, {
        canBrowse: false,
        canViewDetails: false,
        model: buildDatabaseTableViewModel('mysql', [
          {
            defaultCharacterSet: 'utf8mb4',
            defaultCollation: 'utf8mb4_0900_ai_ci',
            engine: 'mysql',
            name: 'app',
            sizeBytes: 1024,
          },
        ]),
        onBrowse: () => undefined,
        onDetails: () => undefined,
      }),
    )

    expect(header).toContain('MySQL · mysql.internal:3306')
    expect(table).toContain('Character set')
    expect(table).toContain('utf8mb4_0900_ai_ci')
    expect(table).not.toContain('Connectable')
    expect(table).not.toContain('>Owner<')
    expect(table).not.toContain('PUBLIC')
    expect(table).not.toContain('PostgreSQL')
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

  it('shows sign-out failures without changing the action name', () => {
    const html = renderToStaticMarkup(
      createElement(SignOutButton, {
        error: 'Sign out failed. Check your connection and try again.',
        onSignOut: () => undefined,
        signingOut: false,
      }),
    )

    expect(html).toContain('aria-label="Sign out"')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Sign out failed. Check your connection and try again.')
  })
})
