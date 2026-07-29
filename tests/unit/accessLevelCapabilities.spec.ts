import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { buildAccessLevelOptions } from '@/features/database-manager/model/accessLevelOptions'
import { enginePresentation } from '@/features/database-manager/model/enginePresentation'
import type { PrincipalManagementActions } from '@/features/database-manager/model/lifecycleViewModels'
import type { ManagerActions } from '@/features/database-manager/model/viewModels'
import { PrincipalDialog } from '@/features/database-manager/ui/dialogs/PrincipalDialog'
import { PrincipalManagementDialog } from '@/features/database-manager/ui/dialogs/PrincipalManagementDialog'

const databases = [{ label: 'app', value: 'app' }]

const createActions: ManagerActions['principalForm'] = {
  onDatabaseChange: () => undefined,
  onLevelChange: () => undefined,
  onNameChange: () => undefined,
  onSubmit: () => undefined,
}

const managementActions: PrincipalManagementActions = {
  close: () => undefined,
  manage: () => undefined,
  onApplyAccess: () => undefined,
  onDatabaseChange: () => undefined,
  onDrop: () => undefined,
  onDropConfirmationChange: () => undefined,
  onLevelChange: () => undefined,
  onRevokeAccess: () => undefined,
  onRotatePassword: () => undefined,
  onToggleLogin: () => undefined,
}

describe('engine capability-driven access presets', () => {
  it('renders only the engine-advertised subset in create and management dialogs', () => {
    const accessOptions = buildAccessLevelOptions(['read'])
    const createHtml = renderToStaticMarkup(
      createElement(PrincipalDialog, {
        accessOptions,
        actions: createActions,
        databases,
        error: null,
        onClose: () => undefined,
        presentation: enginePresentation('postgresql').principal,
        submitting: false,
        value: { database: 'app', level: 'read', name: 'reader' },
      }),
    )
    const manageHtml = renderToStaticMarkup(
      createElement(PrincipalManagementDialog, {
        accessOptions,
        actions: managementActions,
        databases,
        model: {
          accessForm: { database: 'app', level: 'read' },
          accessInventory: [{
            database: 'app',
            directPreset: 'read',
            effectivePreset: 'read',
            potentialPreset: 'read',
            sources: ['direct'],
          }],
          accessInventoryError: null,
          accessInventoryLoading: false,
          accessInventoryObservedAt: null,
          accessInventoryTruncated: false,
          canMutate: true,
          canConfirmDrop: false,
          canRevokeCurrentAccess: true,
          currentAccess: {
            database: 'app',
            directPreset: 'read',
            effectivePreset: 'read',
            potentialPreset: 'read',
            sources: ['direct'],
          },
          dropConfirmation: '',
          error: null,
          principal: {
            authenticationUsername: 'reader',
            canCreateDatabase: false,
            canCreateRole: false,
            canLogin: true,
            isSuperuser: false,
            managementDisabledReason: null,
            memberships: [],
            name: 'reader',
            validUntil: null,
          },
          submitting: false,
          warnings: [],
        },
        presentation: enginePresentation('postgresql').principal,
      }),
    )

    for (const html of [createHtml, manageHtml]) {
      expect(html).toContain('<option value="read" selected="">Read only</option>')
      expect(html).not.toContain('value="connect"')
      expect(html).not.toContain('value="write"')
      expect(html).not.toContain('value="developer"')
    }
    expect(manageHtml).toContain('Current database access')
    expect(manageHtml).toContain('Matches Read only')
    expect(manageHtml).toContain('Effective: Read only')
  })
})
