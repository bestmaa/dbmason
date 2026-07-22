import type { ObservabilityDatabaseTableViewModel } from '../../model/observabilityViewModels'

export function ObservabilityDatabaseTable({
  model,
}: {
  model: ObservabilityDatabaseTableViewModel
}) {
  return (
    <section className="observability-databases">
      <header>
        <div>
          <p className="eyebrow">Native database metrics</p>
          <h3>Database activity</h3>
        </div>
        <small>{model.note}</small>
      </header>
      <div className="resource-table-wrap">
        <table className="resource-table observability-table">
          <caption className="sr-only">{model.caption}</caption>
          <thead>
            <tr>
              <th>Database</th>
              {model.columns.map((column) => <th key={column}>{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row) => (
              <tr key={row.database}>
                <th scope="row"><span className="db-avatar">{row.database.slice(0, 2).toUpperCase()}</span><code>{row.database}</code></th>
                {row.values.map((value, index) => <td key={model.columns[index] ?? index}>{value}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {model.rows.length === 0 && <p className="observability-empty">{model.emptyMessage}</p>}
    </section>
  )
}
