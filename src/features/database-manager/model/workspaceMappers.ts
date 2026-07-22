import type {
  RelationSummary,
  WorkspaceCell,
  WorkspaceQueryResult,
} from '@/modules/database-manager/domain/workspace'

export interface WorkspaceRelationRow {
  estimatedRowsLabel: string
  key: string
  kindLabel: string
  name: string
  schema: string
  selected: boolean
  sizeLabel: string
}

export interface WorkspaceResultViewModel {
  columns: readonly string[]
  rows: readonly { cells: readonly string[]; key: string }[]
  summary: string
  warning: string | null
}

function formatBytes(value: string | null): string {
  if (value === null) return 'Size unavailable'
  const bytes = Number(value)
  if (!Number.isFinite(bytes)) return 'Size unavailable'
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`
}

function kindLabel(kind: RelationSummary['kind']): string {
  return kind.replaceAll('-', ' ')
}

function formatEstimatedRows(value: string | null): string {
  if (value === null) return 'Rows unknown'
  try {
    return `~${BigInt(value).toLocaleString()} rows`
  } catch {
    return 'Rows unknown'
  }
}

export function buildWorkspaceRelationRows(
  relations: readonly RelationSummary[],
  selected: RelationSummary | null,
): readonly WorkspaceRelationRow[] {
  return relations.map((relation) => ({
    estimatedRowsLabel: formatEstimatedRows(relation.estimatedRows),
    key: `${relation.schema}.${relation.name}`,
    kindLabel: kindLabel(relation.kind),
    name: relation.name,
    schema: relation.schema,
    selected: relation.schema === selected?.schema && relation.name === selected.name,
    sizeLabel: formatBytes(relation.sizeBytes),
  }))
}

function formatCell(value: WorkspaceCell): string {
  if (value === null) return 'NULL'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

export function buildWorkspaceResultView(
  result: WorkspaceQueryResult | null,
): WorkspaceResultViewModel | null {
  if (!result) return null
  const warnings = [
    result.truncated ? 'Result was truncated by the row or response limit.' : '',
    result.truncatedCells ? 'Large or binary cells were shortened for display.' : '',
  ].filter(Boolean)
  return {
    columns: result.columns.map((column) => column.name),
    rows: result.rows.map((row, index) => ({
      cells: row.map(formatCell),
      key: `result-${index}`,
    })),
    summary: `${result.rowCount} rows · ${result.durationMs} ms`,
    warning: warnings.length > 0 ? warnings.join(' ') : null,
  }
}
