import { LockKeyhole, TableProperties } from 'lucide-react'
import type { MouseEventHandler } from 'react'

import type { DatabaseSummary } from '@/modules/database-manager/domain/contracts'

function formatBytes(value: number | null): string {
  if (value === null) return '—'
  if (value < 1_048_576) return `${Math.round(value / 1024)} KB`
  if (value < 1_073_741_824) return `${(value / 1_048_576).toFixed(1)} MB`
  return `${(value / 1_073_741_824).toFixed(1)} GB`
}

interface DatabaseTableProps {
  canBrowse: boolean
  databases: readonly DatabaseSummary[]
  onBrowse: MouseEventHandler<HTMLButtonElement>
}

export function DatabaseTable({ canBrowse, databases, onBrowse }: DatabaseTableProps) {
  return (
    <div className="resource-table-wrap">
      <table className="resource-table">
        <caption className="sr-only">PostgreSQL databases</caption>
        <thead><tr><th>Database</th><th>Owner</th><th>Encoding</th><th>Size</th><th>Access</th><th>PUBLIC grants</th>{canBrowse && <th><span className="sr-only">Actions</span></th>}</tr></thead>
        <tbody>
          {databases.map((database) => (
            <tr key={database.name}>
              <th scope="row"><span className="db-avatar">{database.name.slice(0, 2).toUpperCase()}</span><code>{database.name}</code></th>
              <td><code>{database.owner}</code></td>
              <td>{database.encoding}</td>
              <td>{formatBytes(database.sizeBytes)}</td>
              <td>
                <span className={`table-status${database.allowConnections ? '' : ' table-status--locked'}`}>
                  <LockKeyhole size={13} /> {database.allowConnections ? 'Connectable' : 'Blocked'}
                </span>
              </td>
              <td>
                <div className="tag-list" title="Inherited by every PostgreSQL role">
                  {database.publicConnect && <span className="tag tag--warning">CONNECT</span>}
                  {database.publicTemporary && <span className="tag tag--warning">TEMPORARY</span>}
                  {!database.publicConnect && !database.publicTemporary && <span className="table-status table-status--muted">None</span>}
                </div>
              </td>
              {canBrowse && <td><button aria-label={`Browse ${database.name}`} className="icon-button" data-database={database.name} onClick={onBrowse} type="button"><TableProperties size={16} /></button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
