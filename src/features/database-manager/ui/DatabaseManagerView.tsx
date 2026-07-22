import { ShieldCheck } from 'lucide-react'

import type { DatabaseManagerViewProps } from '../model/viewModels'
import { ConnectionRail } from './ConnectionRail'
import { OverviewCards } from './OverviewCards'
import { ResourcePanel } from './ResourcePanel'
import { WorkspaceHeader } from './WorkspaceHeader'
import { EmptyState, ErrorState, LoadingState } from './WorkspaceStates'
import { ConnectionDialog } from './dialogs/ConnectionDialog'
import { ConnectionRemovalDialog } from './dialogs/ConnectionRemovalDialog'
import { CredentialDialog } from './dialogs/CredentialDialog'
import { DatabaseDialog } from './dialogs/DatabaseDialog'
import { PrincipalDialog } from './dialogs/PrincipalDialog'
import { PrincipalManagementDialog } from './dialogs/PrincipalManagementDialog'

export function DatabaseManagerView({ actions, model, product }: DatabaseManagerViewProps) {
  return (
    <div className="manager-shell">
      <ConnectionRail
        canAdd={model.capabilities.canCreateConnection}
        connections={model.connections}
        engineLabels={model.engineLabels}
        onAdd={actions.openConnectionDialog}
        onSelect={actions.selectConnection}
        productName={product.name}
        selectedId={model.selectedConnectionId}
      />
      <main className="workspace">
        <div className="workspace-topbar">
          <div>
            <ShieldCheck size={15} />
            <span>Encrypted control plane</span>
            <a
              className="source-link"
              href={product.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              Source · v{product.version} · {product.licenseName}
            </a>
          </div>
          <div className="identity">
            <span>{model.identity.name}</span>
            <small>
              {model.identity.email} / {model.identity.roles.join(', ') || 'read only'}
            </small>
            <span className="identity__avatar">
              {model.identity.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </div>

        {model.error && model.state === 'ready' && (
          <div aria-live="polite" className="error-banner">
            {model.error}
          </div>
        )}
        {model.state === 'empty' && (
          <EmptyState
            canAdd={model.capabilities.canCreateConnection}
            onAdd={actions.openConnectionDialog}
          />
        )}
        {model.state === 'loading' && !model.snapshot && <LoadingState />}
        {model.state === 'error' && (
          <ErrorState message={model.error ?? 'Unknown error'} onRetry={actions.refresh} />
        )}

        {model.selectedConnection && model.snapshot && model.resourceDatabaseTable && (
          <div className="workspace-content">
            <WorkspaceHeader
              canCreateDatabase={model.capabilities.canCreateDatabase}
              canCreatePrincipal={model.capabilities.canCreatePrincipal}
              canDeleteConnection={model.capabilities.canDeleteConnection}
              connection={model.selectedConnection}
              engineLabel={model.engineLabels[model.selectedConnection.engine]}
              loading={model.state === 'loading'}
              onCreateDatabase={actions.openDatabaseDialog}
              onCreatePrincipal={actions.openPrincipalDialog}
              onDeleteConnection={actions.connectionRemoval.open}
              onRefresh={actions.refresh}
            />
            <OverviewCards
              databaseCount={model.totals.databases}
              loginCount={model.totals.loginRoles}
              protectedCount={model.totals.privilegedRoles}
            />
            <ResourcePanel
              activeTab={model.activeTab}
              canManagePrincipals={model.capabilities.canManagePrincipals}
              canUseWorkspace={model.capabilities.canUseWorkspace}
              canViewObservability={model.capabilities.canViewObservability}
              observabilityActions={actions.observability}
              observabilityModel={model.observability}
              onBrowseDatabase={actions.browseDatabase}
              onResourceFilterChange={actions.onResourceFilterChange}
              onShowDatabases={actions.showDatabases}
              onShowObservability={actions.showObservability}
              onShowPrincipals={actions.showPrincipals}
              onShowWorkspace={actions.showWorkspace}
              principalManagement={actions.principalManagement}
              principalRows={model.resourcePrincipalRows}
              presentation={model.selectedEnginePresentation ?? model.connectionFormPresentation}
              resourceDatabaseTable={model.resourceDatabaseTable}
              resourceFilter={model.resourceFilter}
              snapshot={model.snapshot}
              workspaceActions={actions.workspace}
              workspaceModel={model.workspace}
            />
          </div>
        )}
      </main>

      {model.openDialog === 'connection' && (
        <ConnectionDialog
          actions={actions.connectionForm}
          engineOptions={model.engineOptions}
          error={model.dialogError}
          onClose={actions.closeDialog}
          presentation={model.connectionFormPresentation}
          submitting={model.submitting}
          value={model.connectionForm}
        />
      )}
      {model.openDialog === 'database' && (
        <DatabaseDialog
          actions={actions.databaseForm}
          error={model.dialogError}
          onClose={actions.closeDialog}
          presentation={(model.selectedEnginePresentation ?? model.connectionFormPresentation).database}
          submitting={model.submitting}
          value={model.databaseForm}
        />
      )}
      {model.openDialog === 'principal' && (
        <PrincipalDialog
          accessOptions={model.accessOptions}
          actions={actions.principalForm}
          databases={model.databaseOptions}
          error={model.dialogError}
          onClose={actions.closeDialog}
          presentation={(model.selectedEnginePresentation ?? model.connectionFormPresentation).principal}
          submitting={model.submitting}
          value={model.principalForm}
        />
      )}
      {model.openDialog === 'credential' && model.credential && (
        <CredentialDialog
          copied={model.credentialCopied}
          credential={model.credential}
          error={model.dialogError}
          onClose={actions.closeDialog}
          onCopy={actions.copyCredential}
        />
      )}
      <PrincipalManagementDialog
        accessOptions={model.accessOptions}
        actions={actions.principalManagement}
        databases={model.databaseOptions}
        model={model.principalManagement}
        presentation={(model.selectedEnginePresentation ?? model.connectionFormPresentation).principal}
      />
      <ConnectionRemovalDialog
        actions={actions.connectionRemoval}
        model={model.connectionRemoval}
      />
    </div>
  )
}
