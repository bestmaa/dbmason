import { Play, Shield } from 'lucide-react'

import type { WorkspaceActions, WorkspaceModel } from '../../model/workspaceViewModels'

interface ReadOnlySqlEditorProps {
  actions: Pick<WorkspaceActions, 'onQueryChange' | 'runQuery'>
  model: Pick<WorkspaceModel, 'canRunQuery' | 'copy' | 'loading' | 'querySql'>
}

export function ReadOnlySqlEditor({ actions, model }: ReadOnlySqlEditorProps) {
  return (
    <form className="sql-editor" onSubmit={actions.runQuery}>
      <header>
        <div><p className="eyebrow">{model.copy.guardEyebrow}</p><strong>Read-only SQL</strong></div>
        <span><Shield size={12} /> 5s · 200 rows · 1 MiB</span>
      </header>
      <label>
        <span className="sr-only">Read-only SQL query</span>
        <textarea
          aria-label="Read-only SQL query"
          onChange={actions.onQueryChange}
          spellCheck={false}
          value={model.querySql}
        />
      </label>
      <footer>
        <p>One query expression only. Writes, DDL, transaction control and administrator execution are blocked.</p>
        <button className="primary-button" disabled={!model.canRunQuery} type="submit">
          <Play size={13} /> {model.loading ? 'Running…' : 'Run query'}
        </button>
      </footer>
    </form>
  )
}
