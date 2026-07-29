import type { PrincipalDatabaseAccess } from '@/modules/database-manager/domain/contracts'

import {
  accessSourceLabel,
  accessTone,
  directPresetLabel,
  effectiveAccessLabel,
} from '../model/principalAccess'

interface PrincipalAccessInventoryProps {
  accesses: readonly PrincipalDatabaseAccess[]
  error: string | null
  loading: boolean
  observedAt: string | null
  selectedDatabase: string
  truncated: boolean
}

export function PrincipalAccessInventory(props: PrincipalAccessInventoryProps) {
  return (
    <section aria-labelledby="principal-access-heading" className="access-inventory">
      <div className="lifecycle-heading">
        <div>
          <h3 id="principal-access-heading">Current database access</h3>
          <small>Live, point-in-time grants read from the managed server.</small>
        </div>
        {props.observedAt && (
          <time dateTime={props.observedAt}>
            {props.observedAt.replace('T', ' ').slice(0, 19)} UTC
          </time>
        )}
      </div>
      {props.loading && (
        <p aria-live="polite" className="access-inventory__message" role="status">
          Reading current grants…
        </p>
      )}
      {props.error && (
        <p className="inline-error access-inventory__message" role="alert">{props.error}</p>
      )}
      {!props.loading && !props.error && props.accesses.length === 0 && (
        <p className="access-inventory__message">No database access information is available.</p>
      )}
      {props.accesses.length > 0 && (
        <div className="access-inventory__table-wrap">
          <table className="access-inventory__table">
            <caption className="sr-only">Current access for each database</caption>
            <thead>
              <tr><th>Database</th><th>Direct preset match</th><th>Effective</th><th>Source</th></tr>
            </thead>
            <tbody>
              {props.accesses.map((access) => (
                <tr
                  className={access.database === props.selectedDatabase ? 'is-selected' : undefined}
                  key={access.database}
                >
                  <th scope="row"><code>{access.database}</code></th>
                  <td><span className={`access-status${accessTone(access.directPreset)}`}>{directPresetLabel(access.directPreset)}</span></td>
                  <td>
                    <span className={`access-status${accessTone(access.effectivePreset)}`}>
                      {effectiveAccessLabel(access.effectivePreset)}
                    </span>
                    {access.potentialPreset !== access.effectivePreset && (
                      <small>Potential: {effectiveAccessLabel(access.potentialPreset)}</small>
                    )}
                  </td>
                  <td>
                    <div className="access-source-list">
                      {access.sources.length === 0 && <span>—</span>}
                      {access.sources.map((source) => <span className="access-source" key={source}>{accessSourceLabel(source)}</span>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {props.truncated && (
        <p className="inline-warning access-inventory__message">
          The server has more databases than this bounded inspection can classify.
        </p>
      )}
      <p className="form-note">
        Preset matches cover DBMason’s managed database/public-schema scope. Network rules,
        row policies, functions, and externally changed grants can still affect access.
      </p>
    </section>
  )
}
