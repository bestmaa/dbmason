import { Copy, KeyRound, Network } from 'lucide-react'

import { Modal } from '@/ui/Modal'

import type { ConnectionEndpoint } from '../../model/connectionDetails'
import type {
  ConnectionDetailsActions,
  ConnectionDetailsModel,
} from '../../model/connectionDetailsViewModels'

type Props = {
  actions: ConnectionDetailsActions
  model: ConnectionDetailsModel
}

function EndpointCard({
  actions,
  endpoint,
  kind,
  model,
  template,
}: {
  actions: ConnectionDetailsActions
  endpoint: ConnectionEndpoint
  kind: 'external' | 'internal'
  model: ConnectionDetailsModel
  template: string
}) {
  const copyTemplate =
    kind === 'internal' ? actions.copyInternalTemplate : actions.copyExternalTemplate
  const copyComplete = kind === 'internal' ? actions.copyInternal : actions.copyExternal

  return (
    <section className="connection-endpoint">
      <header>
        <div>
          <strong>{kind === 'internal' ? 'Saved management endpoint' : 'External endpoint'}</strong>
          <span>
            {endpoint.host}:{endpoint.port} · TLS {endpoint.sslMode}
          </span>
        </div>
        <Network aria-hidden="true" size={17} />
      </header>
      <code>{template}</code>
      <div className="connection-endpoint__actions">
        <button className="button button--quiet" onClick={copyTemplate} type="button">
          <Copy aria-hidden="true" size={13} /> Copy template
        </button>
        <button
          className="button button--quiet"
          disabled={!model.password}
          onClick={copyComplete}
          type="button"
        >
          <KeyRound aria-hidden="true" size={13} /> Copy with password
        </button>
      </div>
    </section>
  )
}

export function ConnectionDetailsDialog({ actions, model }: Props) {
  if (!model.open) return null
  return (
    <Modal
      description={`Connection information for ${model.database} on ${model.connectionName}.`}
      error={model.error}
      onClose={actions.close}
      title="Database connection details"
    >
      <div className="connection-details">
        <div className="connection-details__notice">
          DBMason never reveals the saved administrator password. Choose a least-privilege login
          account and enter its password only when you need a complete URL.
        </div>
        <label className="field">
          <span>Database login account</span>
          <select onChange={actions.onPrincipalChange} value={model.selectedPrincipal}>
            {model.principalOptions.length === 0 ? (
              <option value="">No standard login account available</option>
            ) : null}
            {model.principalOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>
            Password <small>(used in this browser only; never saved)</small>
          </span>
          <input
            autoComplete="new-password"
            onChange={actions.onPasswordChange}
            placeholder="Password for the selected database account"
            type="password"
            value={model.password}
          />
        </label>

        <EndpointCard
          actions={actions}
          endpoint={model.internal}
          kind="internal"
          model={model}
          template={model.internalTemplate}
        />
        <p className="connection-details__help">
          “Saved management endpoint” is the host DBMason already uses. It works only from networks
          that can reach that host, such as the same Docker network.
        </p>

        {model.external ? (
          <EndpointCard
            actions={actions}
            endpoint={model.external}
            kind="external"
            model={model}
            template={model.externalTemplate}
          />
        ) : (
          <div className="connection-details__empty">
            <strong>External endpoint not configured</strong>
            <p>DBMason cannot discover Dockploy port publishing automatically.</p>
          </div>
        )}
        {model.engine === 'mysql' ? (
          <p className="connection-details__help">
            MySQL URLs do not carry a portable TLS-mode option; configure TLS in the client using
            the mode shown above.
          </p>
        ) : null}
        {model.copied ? (
          <p className="connection-details__copied" role="status">
            {model.copied}
          </p>
        ) : null}

        {model.canEditExternal ? (
          <form className="connection-external-form" onSubmit={actions.saveExternal}>
            <h3>External endpoint metadata</h3>
            <p>
              This saves display metadata only. It does not expose a port or change the database.
            </p>
            <div className="form-grid form-grid--embedded">
              <label className="field field--wide">
                <span>External hostname or IP</span>
                <input
                  onChange={actions.onExternalHostChange}
                  placeholder="db.example.com"
                  required
                  value={model.externalForm.host}
                />
              </label>
              <label className="field">
                <span>External port</span>
                <input
                  inputMode="numeric"
                  max="65535"
                  min="1"
                  onChange={actions.onExternalPortChange}
                  required
                  type="number"
                  value={model.externalForm.port}
                />
              </label>
              <label className="field">
                <span>TLS mode</span>
                <select
                  onChange={actions.onExternalSslModeChange}
                  value={model.externalForm.sslMode}
                >
                  <option value="verify-full">Verify certificate</option>
                  <option value="require">Require TLS</option>
                  <option value="prefer">Legacy prefer</option>
                  <option value="disable">Disabled</option>
                </select>
              </label>
              <footer className="modal__footer field--wide">
                {model.external ? (
                  <button
                    className="button button--quiet"
                    disabled={model.submitting}
                    onClick={actions.clearExternal}
                    type="button"
                  >
                    Clear external
                  </button>
                ) : null}
                <button
                  className="button button--primary"
                  disabled={model.submitting}
                  type="submit"
                >
                  {model.submitting ? 'Saving…' : 'Save external'}
                </button>
              </footer>
            </div>
          </form>
        ) : null}
      </div>
    </Modal>
  )
}
