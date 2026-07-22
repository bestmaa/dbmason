import { Activity, Code2, Database, Search, Users } from 'lucide-react'
import type { ChangeEventHandler, MouseEventHandler } from 'react'

import type { ServerSnapshot } from '@/modules/database-manager/domain/contracts'

import type { DatabaseTableViewModel } from '../model/databaseResources'
import type { PrincipalManagementActions } from '../model/lifecycleViewModels'
import type { EnginePresentation } from '../model/enginePresentation'
import type {
  ObservabilityPanelActions,
  ObservabilityPanelModel,
} from '../model/observabilityViewModels'
import type { PrincipalRowViewModel } from '../model/principalRows'
import type { ResourceTab } from '../model/viewModels'
import type { WorkspaceActions, WorkspaceModel } from '../model/workspaceViewModels'
import { DatabaseTable } from './DatabaseTable'
import { PrincipalTable } from './PrincipalTable'
import { ObservabilityPanel } from './observability/ObservabilityPanel'
import { DataWorkspacePanel } from './workspace/DataWorkspacePanel'

interface ResourcePanelProps {
  activeTab: ResourceTab
  canManagePrincipals: boolean
  canUseWorkspace: boolean
  canViewObservability: boolean
  onBrowseDatabase: MouseEventHandler<HTMLButtonElement>
  onResourceFilterChange: ChangeEventHandler<HTMLInputElement>
  onShowDatabases: () => void
  onShowObservability: () => void
  onShowPrincipals: () => void
  onShowWorkspace: () => void
  observabilityActions: ObservabilityPanelActions
  observabilityModel: ObservabilityPanelModel
  presentation: EnginePresentation
  principalManagement: PrincipalManagementActions
  principalRows: readonly PrincipalRowViewModel[]
  resourceDatabaseTable: DatabaseTableViewModel
  resourceFilter: string
  snapshot: ServerSnapshot
  workspaceActions: WorkspaceActions
  workspaceModel: WorkspaceModel
}

export function ResourcePanel(props: ResourcePanelProps) {
  return (
    <section className="resource-panel">
      <header className="resource-panel__header">
        <div className="tabs" role="tablist">
          <button
            aria-selected={props.activeTab === 'databases'}
            className={props.activeTab === 'databases' ? 'is-active' : ''}
            onClick={props.onShowDatabases}
            role="tab"
            type="button"
          >
            <Database size={15} /> Databases <span>{props.snapshot.databases.length}</span>
          </button>
          <button
            aria-selected={props.activeTab === 'principals'}
            className={props.activeTab === 'principals' ? 'is-active' : ''}
            onClick={props.onShowPrincipals}
            role="tab"
            type="button"
          >
            <Users size={15} /> {props.presentation.principal.listLabel} <span>{props.snapshot.principals.length}</span>
          </button>
          {props.canViewObservability && (
            <button
              aria-selected={props.activeTab === 'observability'}
              className={props.activeTab === 'observability' ? 'is-active' : ''}
              onClick={props.onShowObservability}
              role="tab"
              type="button"
            >
              <Activity size={15} /> Observability <span>Live</span>
            </button>
          )}
          {props.canUseWorkspace && (
            <button
              aria-selected={props.activeTab === 'workspace'}
              className={props.activeTab === 'workspace' ? 'is-active' : ''}
              onClick={props.onShowWorkspace}
              role="tab"
              type="button"
            >
              <Code2 size={15} /> Data &amp; SQL <span>Read</span>
            </button>
          )}
        </div>
        {(props.activeTab === 'databases' || props.activeTab === 'principals') && (
          <label className="search-field">
            <Search aria-hidden="true" size={15} />
            <span className="sr-only">Filter resources</span>
            <input
              onChange={props.onResourceFilterChange}
              placeholder="Filter resources"
              type="search"
              value={props.resourceFilter}
            />
          </label>
        )}
      </header>
      {props.activeTab === 'observability' ? (
        <ObservabilityPanel actions={props.observabilityActions} model={props.observabilityModel} />
      ) : props.activeTab === 'workspace' ? (
        <DataWorkspacePanel actions={props.workspaceActions} model={props.workspaceModel} />
      ) : props.activeTab === 'databases' ? (
        <DatabaseTable
          canBrowse={props.canUseWorkspace}
          model={props.resourceDatabaseTable}
          onBrowse={props.onBrowseDatabase}
        />
      ) : (
        <PrincipalTable
          canManage={props.canManagePrincipals}
          onManage={props.principalManagement.manage}
          principals={props.principalRows}
        />
      )}
    </section>
  )
}
