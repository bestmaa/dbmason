export const relationKinds = [
  'table',
  'partitioned-table',
  'view',
  'materialized-view',
  'foreign-table',
] as const

export type RelationKind = (typeof relationKinds)[number]
export type WorkspaceCell = boolean | null | number | string

export interface WorkspaceCredential {
  database: string
  password: string
  principal: string
}

export interface RelationSummary {
  estimatedRows: string | null
  kind: RelationKind
  name: string
  schema: string
  sizeBytes: string | null
}

export interface WorkspaceCatalog {
  database: string
  relations: readonly RelationSummary[]
  truncated: boolean
}

export type LoadWorkspaceCatalogCommand = WorkspaceCredential

export interface BrowseRelationCommand extends WorkspaceCredential {
  limit: number
  offset: number
  relation: string
  schema: string
}

export interface RunReadOnlyQueryCommand extends WorkspaceCredential {
  maxRows: number
  sql: string
}

export interface WorkspaceColumn {
  dataTypeId: number
  name: string
}

export interface WorkspaceQueryResult {
  columns: readonly WorkspaceColumn[]
  durationMs: number
  rowCount: number
  rows: readonly (readonly WorkspaceCell[])[]
  truncated: boolean
  truncatedCells: boolean
}
