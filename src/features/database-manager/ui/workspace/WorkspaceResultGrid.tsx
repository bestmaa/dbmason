import { ChevronLeft, ChevronRight } from 'lucide-react'

import type { WorkspaceActions, WorkspaceModel } from '../../model/workspaceViewModels'

interface WorkspaceResultGridProps {
  actions: Pick<WorkspaceActions, 'nextPage' | 'previousPage'>
  model: Pick<
    WorkspaceModel,
    | 'canNextPage'
    | 'canPreviousPage'
    | 'loading'
    | 'offset'
    | 'resultLabel'
    | 'resultView'
    | 'selectedRelation'
  >
}

export function WorkspaceResultGrid({ actions, model }: WorkspaceResultGridProps) {
  return (
    <section className="workspace-results">
      <header>
        <div><p className="eyebrow">Bounded output</p><strong>{model.resultLabel}</strong></div>
        {model.resultView && <span>{model.resultView.summary}</span>}
      </header>
      {!model.resultView && <div className="workspace-results__empty">Choose a relation or run a read-only query.</div>}
      {model.resultView && model.resultView.rows.length === 0 && <div className="workspace-results__empty">The query returned no rows.</div>}
      {model.resultView && model.resultView.rows.length > 0 && (
        <div className="workspace-results__table-wrap">
          <table>
            <thead><tr>{model.resultView.columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}</tr></thead>
            <tbody>{model.resultView.rows.map((row) => <tr key={row.key}>{row.cells.map((cell, index) => <td key={`${row.key}-${index}`}><code>{cell}</code></td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {model.resultView?.warning && <p className="workspace-results__warning">{model.resultView.warning}</p>}
      {model.selectedRelation && (
        <footer>
          <span>Rows {model.offset + 1}–{model.offset + (model.resultView?.rows.length ?? 0)}</span>
          <div>
            <button aria-label="Previous data page" disabled={!model.canPreviousPage || model.loading} onClick={actions.previousPage} type="button"><ChevronLeft size={14} /></button>
            <button aria-label="Next data page" disabled={!model.canNextPage || model.loading} onClick={actions.nextPage} type="button"><ChevronRight size={14} /></button>
          </div>
        </footer>
      )}
    </section>
  )
}
