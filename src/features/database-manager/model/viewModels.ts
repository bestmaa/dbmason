import type { ChangeEventHandler, FormEventHandler, MouseEventHandler } from 'react'

import type { AppRole } from '@/access/appRoles'
import type {
  AccessLevel,
  ConnectionSummary,
  CreatePrincipalResult,
  DatabaseSummary,
  ServerSnapshot,
  SslMode,
} from '@/modules/database-manager/domain/contracts'

import type { ManagerCapabilities } from './managerCapabilities'
import type {
  ConnectionRemovalActions,
  ConnectionRemovalModel,
  PrincipalManagementActions,
  PrincipalManagementModel,
} from './lifecycleViewModels'
import type { PrincipalRowViewModel } from './principalRows'
import type { ObservabilityPanelActions, ObservabilityPanelModel } from './observabilityViewModels'
import type { WorkspaceState } from './workspaceState'
import type { WorkspaceActions, WorkspaceModel } from './workspaceViewModels'

export type ResourceTab = 'databases' | 'observability' | 'principals' | 'workspace'

export interface ManagerIdentity {
  email: string
  name: string
  roles: readonly AppRole[]
}

export interface ConnectionFormValue {
  host: string
  maintenanceDatabase: string
  name: string
  password: string
  port: string
  sslMode: SslMode
  username: string
}

export interface DatabaseFormValue {
  name: string
  owner: string
}

export interface PrincipalFormValue {
  database: string
  level: AccessLevel
  name: string
}

export interface ManagerViewModel {
  activeTab: ResourceTab
  capabilities: ManagerCapabilities
  connectionForm: ConnectionFormValue
  connectionRemoval: ConnectionRemovalModel
  connections: readonly ConnectionSummary[]
  credential: CreatePrincipalResult | null
  credentialCopied: boolean
  databaseForm: DatabaseFormValue
  dialogError: string | null
  error: string | null
  identity: ManagerIdentity
  observability: ObservabilityPanelModel
  openDialog: 'connection' | 'credential' | 'database' | 'principal' | null
  principalForm: PrincipalFormValue
  principalManagement: PrincipalManagementModel
  principalRows: readonly PrincipalRowViewModel[]
  resourceDatabases: readonly DatabaseSummary[]
  resourceFilter: string
  resourcePrincipalRows: readonly PrincipalRowViewModel[]
  selectedConnection: ConnectionSummary | null
  selectedConnectionId: string | null
  snapshot: ServerSnapshot | null
  state: WorkspaceState
  submitting: boolean
  totals: {
    databases: number
    loginRoles: number
    privilegedRoles: number
  }
  workspace: WorkspaceModel
}

export interface ManagerActions {
  closeDialog: () => void
  copyCredential: () => void
  openConnectionDialog: () => void
  openDatabaseDialog: () => void
  openPrincipalDialog: () => void
  refresh: () => void
  onResourceFilterChange: ChangeEventHandler<HTMLInputElement>
  browseDatabase: MouseEventHandler<HTMLButtonElement>
  selectConnection: MouseEventHandler<HTMLButtonElement>
  showDatabases: () => void
  showObservability: () => void
  showPrincipals: () => void
  showWorkspace: () => void
  observability: ObservabilityPanelActions
  connectionRemoval: ConnectionRemovalActions
  connectionForm: {
    onHostChange: ChangeEventHandler<HTMLInputElement>
    onMaintenanceDatabaseChange: ChangeEventHandler<HTMLInputElement>
    onNameChange: ChangeEventHandler<HTMLInputElement>
    onPasswordChange: ChangeEventHandler<HTMLInputElement>
    onPortChange: ChangeEventHandler<HTMLInputElement>
    onSslModeChange: ChangeEventHandler<HTMLSelectElement>
    onSubmit: FormEventHandler<HTMLFormElement>
    onUsernameChange: ChangeEventHandler<HTMLInputElement>
  }
  databaseForm: {
    onNameChange: ChangeEventHandler<HTMLInputElement>
    onOwnerChange: ChangeEventHandler<HTMLInputElement>
    onSubmit: FormEventHandler<HTMLFormElement>
  }
  principalForm: {
    onDatabaseChange: ChangeEventHandler<HTMLSelectElement>
    onLevelChange: ChangeEventHandler<HTMLSelectElement>
    onNameChange: ChangeEventHandler<HTMLInputElement>
    onSubmit: FormEventHandler<HTMLFormElement>
  }
  principalManagement: PrincipalManagementActions
  workspace: WorkspaceActions
}

export interface DatabaseManagerViewProps {
  actions: ManagerActions
  model: ManagerViewModel
}
