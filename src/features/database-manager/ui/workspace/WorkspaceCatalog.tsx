import { Table2 } from 'lucide-react'

import type { WorkspaceActions, WorkspaceModel } from '../../model/workspaceViewModels'

interface WorkspaceCatalogProps {
  onBrowse: WorkspaceActions['browseRelation']
  rows: WorkspaceModel['relationRows']
  truncated: boolean
}

export function WorkspaceCatalog({ onBrowse, rows, truncated }: WorkspaceCatalogProps) {
  return (
    <aside className="workspace-catalog">
      <header>
        <div><p className="eyebrow">Visible catalog</p><strong>Relations</strong></div>
        <span>{rows.length}{truncated ? '+' : ''}</span>
      </header>
      <div className="workspace-catalog__list">
        {rows.length === 0 && <p className="workspace-muted">This role cannot read any relations.</p>}
        {rows.map((row) => (
          <button
            className={row.selected ? 'is-active' : ''}
            data-relation={row.name}
            data-schema={row.schema}
            key={row.key}
            onClick={onBrowse}
            type="button"
          >
            <Table2 aria-hidden="true" size={14} />
            <span><code>{row.schema}.{row.name}</code><small>{row.kindLabel} · {row.estimatedRowsLabel} · {row.sizeLabel}</small></span>
          </button>
        ))}
      </div>
    </aside>
  )
}
