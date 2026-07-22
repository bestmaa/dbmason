import type { ObservabilityDatabaseRowViewModel } from '../../model/observabilityViewModels'

export function ObservabilityDatabaseTable({
  rows,
}: {
  rows: readonly ObservabilityDatabaseRowViewModel[]
}) {
  return (
    <section className="observability-databases">
      <header>
        <div>
          <p className="eyebrow">Cumulative counters</p>
          <h3>Database activity</h3>
        </div>
        <small>Transactions show committed / rolled back since statistics reset.</small>
      </header>
      <div className="resource-table-wrap">
        <table className="resource-table observability-table">
          <caption className="sr-only">PostgreSQL database observability counters</caption>
          <thead>
            <tr><th>Database</th><th>Connections</th><th>Transactions</th><th>Cache hit</th><th>Temporary data</th><th>Deadlocks</th><th>Size</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.database}>
                <th scope="row"><span className="db-avatar">{row.database.slice(0, 2).toUpperCase()}</span><code>{row.database}</code></th>
                <td>{row.connections}</td>
                <td>{row.transactions}</td>
                <td>{row.cacheHit}</td>
                <td>{row.temporaryData}</td>
                <td>{row.deadlocks}</td>
                <td>{row.size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="observability-empty">No database counters were returned.</p>}
    </section>
  )
}
