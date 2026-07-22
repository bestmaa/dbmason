import { LockKeyhole, TableProperties } from 'lucide-react'
import type { MouseEventHandler } from 'react'

import type {
  DatabaseTableViewModel,
  MysqlDatabaseRowViewModel,
  PostgresDatabaseRowViewModel,
} from '../model/databaseResources'

interface DatabaseTableProps {
  canBrowse: boolean
  model: DatabaseTableViewModel
  onBrowse: MouseEventHandler<HTMLButtonElement>
}

interface EngineTableProps<Row> {
  canBrowse: boolean
  onBrowse: MouseEventHandler<HTMLButtonElement>
  rows: readonly Row[]
}

function BrowseButton({
  database,
  onBrowse,
}: {
  database: string
  onBrowse: MouseEventHandler<HTMLButtonElement>
}) {
  return (
    <button
      aria-label={`Browse ${database}`}
      className="icon-button"
      data-database={database}
      onClick={onBrowse}
      type="button"
    >
      <TableProperties size={16} />
    </button>
  )
}

function DatabaseName({ name }: { name: string }) {
  return (
    <th scope="row">
      <span className="db-avatar">{name.slice(0, 2).toUpperCase()}</span>
      <code>{name}</code>
    </th>
  )
}

function MysqlDatabaseTable(props: EngineTableProps<MysqlDatabaseRowViewModel>) {
  return (
    <table className="resource-table">
      <caption className="sr-only">Managed MySQL databases</caption>
      <thead>
        <tr><th>Database</th><th>Character set</th><th>Collation</th><th>Size</th>{props.canBrowse && <th><span className="sr-only">Actions</span></th>}</tr>
      </thead>
      <tbody>
        {props.rows.map((database) => (
          <tr key={database.name}>
            <DatabaseName name={database.name} />
            <td>{database.characterSet}</td>
            <td>{database.collation}</td>
            <td>{database.sizeLabel}</td>
            {props.canBrowse && <td><BrowseButton database={database.name} onBrowse={props.onBrowse} /></td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PostgresDatabaseTable(props: EngineTableProps<PostgresDatabaseRowViewModel>) {
  return (
    <table className="resource-table">
      <caption className="sr-only">Managed PostgreSQL databases</caption>
      <thead>
        <tr><th>Database</th><th>Owner</th><th>Encoding</th><th>Size</th><th>Access</th><th>PUBLIC grants</th>{props.canBrowse && <th><span className="sr-only">Actions</span></th>}</tr>
      </thead>
      <tbody>
        {props.rows.map((database) => (
          <tr key={database.name}>
            <DatabaseName name={database.name} />
            <td><code>{database.owner}</code></td>
            <td>{database.encoding}</td>
            <td>{database.sizeLabel}</td>
            <td>
              <span className={`table-status${database.isBlocked ? ' table-status--locked' : ''}`}>
                <LockKeyhole size={13} /> {database.accessLabel}
              </span>
            </td>
            <td>
              <div className="tag-list" title="Inherited through PostgreSQL PUBLIC">
                {database.publicPrivileges.map((privilege) => <span className="tag tag--warning" key={privilege}>{privilege}</span>)}
                {database.publicPrivileges.length === 0 && <span className="table-status table-status--muted">None</span>}
              </div>
            </td>
            {props.canBrowse && <td><BrowseButton database={database.name} onBrowse={props.onBrowse} /></td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function DatabaseTable({ canBrowse, model, onBrowse }: DatabaseTableProps) {
  return (
    <div className="resource-table-wrap">
      {model.engine === 'mysql' ? (
        <MysqlDatabaseTable canBrowse={canBrowse} onBrowse={onBrowse} rows={model.rows} />
      ) : (
        <PostgresDatabaseTable canBrowse={canBrowse} onBrowse={onBrowse} rows={model.rows} />
      )}
    </div>
  )
}
