import { LogOut, ShieldCheck } from 'lucide-react'

import type { DataWorkspacePanelProps } from '../../model/workspaceViewModels'
import { ReadOnlySqlEditor } from './ReadOnlySqlEditor'
import { WorkspaceCatalog } from './WorkspaceCatalog'
import { WorkspaceCredentialGate } from './WorkspaceCredentialGate'
import { WorkspaceResultGrid } from './WorkspaceResultGrid'

export function DataWorkspacePanel({ actions, model }: DataWorkspacePanelProps) {
  return (
    <section className="data-workspace">
      {model.error && <div aria-live="polite" className="workspace-inline-error" role="alert">{model.error}</div>}
      {!model.connected && <WorkspaceCredentialGate actions={actions} model={model} />}
      {model.connected && model.catalog && (
        <>
          <header className="workspace-session">
            <div><ShieldCheck size={14} /><span>Read-only as <code>{model.credential.principal}</code> on <code>{model.credential.database}</code></span></div>
            <button className="secondary-button" onClick={actions.disconnect} type="button"><LogOut size={13} /> Disconnect &amp; forget password</button>
          </header>
          <div className="workspace-grid">
            <WorkspaceCatalog onBrowse={actions.browseRelation} rows={model.relationRows} truncated={model.catalog.truncated} />
            <div className="workspace-main">
              <ReadOnlySqlEditor actions={actions} model={model} />
              <WorkspaceResultGrid actions={actions} model={model} />
            </div>
          </div>
        </>
      )}
    </section>
  )
}
