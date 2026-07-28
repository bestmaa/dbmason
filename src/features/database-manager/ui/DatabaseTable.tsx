import { Link2, LockKeyhole, TableProperties } from 'lucide-react'
import type { MouseEventHandler } from 'react'

import type {
  DatabaseTableViewModel,
  MysqlDatabaseRowViewModel,
  PostgresDatabaseRowViewModel,
} from '../model/databaseResources'

interface DatabaseTableProps {
  canBrowse: boolean
  canViewDetails: boolean
  model: DatabaseTableViewModel
  onBrowse: MouseEventHandler<HTMLButtonElement>
  onDetails: MouseEventHandler<HTMLButtonElement>
}

interface EngineTableProps<Row> {
  canBrowse: boolean
  canViewDetails: boolean
  onBrowse: MouseEventHandler<HTMLButtonElement>
  onDetails: MouseEventHandler<HTMLButtonElement>
  rows: readonly Row[]
}

function DetailsButton({
  database,
  onDetails,
}: {
  database: string
  onDetails: MouseEventHandler<HTMLButtonElement>
}) {
  return (
    <button
      aria-label={`Connection details for ${database}`}
      className="icon-button"
      data-database={database}
      onClick={onDetails}
      title="Connection details"
      type="button"
    >
      <Link2 size={16} />
    </button>
  )
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
        <tr>
          <th>Database</th>
          <th>Character set</th>
          <th>Collation</th>
          <th>Size</th>
          <th>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((database) => (
          <tr key={database.name}>
            <DatabaseName name={database.name} />
            <td>{database.characterSet}</td>
            <td>{database.collation}</td>
            <td>{database.sizeLabel}</td>
            <td>
              <div className="table-actions">
                {props.canViewDetails && (
                  <DetailsButton database={database.name} onDetails={props.onDetails} />
                )}
                {props.canBrowse && (
                  <BrowseButton database={database.name} onBrowse={props.onBrowse} />
                )}
              </div>
            </td>
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
        <tr>
          <th>Database</th>
          <th>Owner</th>
          <th>Encoding</th>
          <th>Size</th>
          <th>Access</th>
          <th>PUBLIC grants</th>
          <th>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((database) => (
          <tr key={database.name}>
            <DatabaseName name={database.name} />
            <td>
              <code>{database.owner}</code>
            </td>
            <td>{database.encoding}</td>
            <td>{database.sizeLabel}</td>
            <td>
              <span className={`table-status${database.isBlocked ? ' table-status--locked' : ''}`}>
                <LockKeyhole size={13} /> {database.accessLabel}
              </span>
            </td>
            <td>
              <div className="tag-list" title="Inherited through PostgreSQL PUBLIC">
                {database.publicPrivileges.map((privilege) => (
                  <span className="tag tag--warning" key={privilege}>
                    {privilege}
                  </span>
                ))}
                {database.publicPrivileges.length === 0 && (
                  <span className="table-status table-status--muted">None</span>
                )}
              </div>
            </td>
            <td>
              <div className="table-actions">
                {props.canViewDetails && (
                  <DetailsButton database={database.name} onDetails={props.onDetails} />
                )}
                {props.canBrowse && (
                  <BrowseButton database={database.name} onBrowse={props.onBrowse} />
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function DatabaseTable({
  canBrowse,
  canViewDetails,
  model,
  onBrowse,
  onDetails,
}: DatabaseTableProps) {
  return (
    <div className="resource-table-wrap">
      {model.engine === 'mysql' ? (
        <MysqlDatabaseTable
          canBrowse={canBrowse}
          canViewDetails={canViewDetails}
          onBrowse={onBrowse}
          onDetails={onDetails}
          rows={model.rows}
        />
      ) : (
        <PostgresDatabaseTable
          canBrowse={canBrowse}
          canViewDetails={canViewDetails}
          onBrowse={onBrowse}
          onDetails={onDetails}
          rows={model.rows}
        />
      )}
    </div>
  )
}
