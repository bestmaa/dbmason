import { Database, Plus, Server, Trash2 } from 'lucide-react'
import type { MouseEventHandler } from 'react'

import type { ConnectionSummary, EngineId } from '@/modules/database-manager/domain/contracts'

interface ConnectionRailProps {
  canAdd: boolean
  canDelete: boolean
  connections: readonly ConnectionSummary[]
  engineLabels: Readonly<Record<EngineId, string>>
  onAdd: () => void
  onRemove: MouseEventHandler<HTMLButtonElement>
  onSelect: MouseEventHandler<HTMLButtonElement>
  productName: string
  selectedId: string | null
}

export function ConnectionRail({
  canAdd,
  canDelete,
  connections,
  engineLabels,
  onAdd,
  onRemove,
  onSelect,
  productName,
  selectedId,
}: ConnectionRailProps) {
  return (
    <aside className="connection-rail">
      <div className="brand">
        <span className="brand__mark"><Database aria-hidden="true" size={20} /></span>
        <span><strong>{productName}</strong><small>Access manager</small></span>
      </div>

      <div className="rail-heading">
        <span>Connections</span>
        <span className="count-pill">{connections.length}</span>
      </div>

      <nav aria-label="Database connections" className="connection-list">
        {connections.map((connection) => (
          <div className="connection-item-row" key={connection.id}>
            <button
              className={`connection-item${selectedId === connection.id ? ' is-active' : ''}`}
              data-connection-id={connection.id}
              onClick={onSelect}
              type="button"
            >
              <span className="connection-item__icon"><Server aria-hidden="true" size={16} /></span>
              <span className="connection-item__copy">
                <strong>{connection.name}</strong>
                <small>{engineLabels[connection.engine]} · {connection.host}:{connection.port}</small>
              </span>
              <span className={`status-dot status-dot--${connection.status}`} title={connection.status} />
            </button>
            {canDelete ? (
              <button
                aria-label={`Remove saved connection ${connection.name}`}
                className="connection-item__remove"
                data-connection-id={connection.id}
                onClick={onRemove}
                title={`Remove ${connection.name}`}
                type="button"
              >
                <Trash2 aria-hidden="true" size={14} />
              </button>
            ) : null}
          </div>
        ))}
      </nav>

      {canAdd && (
        <button className="rail-add" onClick={onAdd} type="button">
          <Plus aria-hidden="true" size={16} /> Add connection
        </button>
      )}
    </aside>
  )
}
