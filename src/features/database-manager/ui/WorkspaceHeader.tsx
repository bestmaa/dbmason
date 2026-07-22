import { Database, Plus, RefreshCw, Trash2, UserPlus } from 'lucide-react'

import type { ConnectionSummary } from '@/modules/database-manager/domain/contracts'

interface WorkspaceHeaderProps {
  canCreateDatabase: boolean
  canCreatePrincipal: boolean
  canDeleteConnection: boolean
  connection: ConnectionSummary
  loading: boolean
  onCreateDatabase: () => void
  onCreatePrincipal: () => void
  onDeleteConnection: () => void
  onRefresh: () => void
}

export function WorkspaceHeader(props: WorkspaceHeaderProps) {
  return (
    <header className="workspace-header">
      <div className="workspace-title">
        <div className="workspace-title__icon"><Database aria-hidden="true" size={22} /></div>
        <div>
          <div className="title-line">
            <h1>{props.connection.name}</h1>
            <span className={`status-badge status-badge--${props.connection.status}`}>
              {props.connection.status}
            </span>
          </div>
          <p>
            PostgreSQL · {props.connection.host}:{props.connection.port}
            {props.connection.serverVersion ? ` · v${props.connection.serverVersion}` : ''}
          </p>
        </div>
      </div>
      <div className="header-actions">
        <button className="button button--quiet" disabled={props.loading} onClick={props.onRefresh} type="button">
          <RefreshCw aria-hidden="true" size={15} /> Refresh
        </button>
        {props.canDeleteConnection && (
          <button aria-label="Remove saved connection" className="button button--quiet" onClick={props.onDeleteConnection} title="Remove saved connection" type="button">
            <Trash2 aria-hidden="true" size={15} /> Remove
          </button>
        )}
        {props.canCreateDatabase && (
          <button className="button button--quiet" onClick={props.onCreateDatabase} type="button">
            <Plus aria-hidden="true" size={15} /> Database
          </button>
        )}
        {props.canCreatePrincipal && (
          <button className="button button--primary" onClick={props.onCreatePrincipal} type="button">
            <UserPlus aria-hidden="true" size={15} /> Create user
          </button>
        )}
      </div>
    </header>
  )
}
