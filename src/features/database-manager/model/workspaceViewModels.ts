import type { ChangeEventHandler, FormEventHandler, MouseEventHandler } from 'react'

import type {
  RelationSummary,
  WorkspaceCatalog,
  WorkspaceQueryResult,
} from '@/modules/database-manager/domain/workspace'

import type { WorkspaceRelationRow, WorkspaceResultViewModel } from './workspaceMappers'
import type { WorkspaceCopy } from './workspaceEngineStrategy'

export interface WorkspaceCredentialValue {
  database: string
  password: string
  principal: string
}

export interface WorkspaceOption {
  label: string
  value: string
}

export interface WorkspaceModel {
  canNextPage: boolean
  canPreviousPage: boolean
  canRunQuery: boolean
  canSubmitCredential: boolean
  catalog: WorkspaceCatalog | null
  connected: boolean
  copy: WorkspaceCopy
  credential: WorkspaceCredentialValue
  databaseOptions: readonly WorkspaceOption[]
  error: string | null
  loading: boolean
  offset: number
  querySql: string
  relationRows: readonly WorkspaceRelationRow[]
  result: WorkspaceQueryResult | null
  resultLabel: string
  resultView: WorkspaceResultViewModel | null
  roleOptions: readonly WorkspaceOption[]
  selectedRelation: RelationSummary | null
}

export interface WorkspaceActions {
  browseRelation: MouseEventHandler<HTMLButtonElement>
  connect: FormEventHandler<HTMLFormElement>
  disconnect: () => void
  nextPage: () => void
  onDatabaseChange: ChangeEventHandler<HTMLSelectElement>
  onPasswordChange: ChangeEventHandler<HTMLInputElement>
  onPrincipalChange: ChangeEventHandler<HTMLSelectElement>
  onQueryChange: ChangeEventHandler<HTMLTextAreaElement>
  previousPage: () => void
  runQuery: FormEventHandler<HTMLFormElement>
}

export interface WorkspaceController {
  actions: WorkspaceActions
  model: WorkspaceModel
  selectDatabase: (database: string) => void
}

export interface DataWorkspacePanelProps {
  actions: WorkspaceActions
  model: WorkspaceModel
}
