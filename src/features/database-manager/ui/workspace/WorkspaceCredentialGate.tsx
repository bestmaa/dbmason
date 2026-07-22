import { KeyRound, ShieldCheck } from 'lucide-react'

import type { WorkspaceActions, WorkspaceModel } from '../../model/workspaceViewModels'

interface WorkspaceCredentialGateProps {
  actions: Pick<
    WorkspaceActions,
    'connect' | 'onDatabaseChange' | 'onPasswordChange' | 'onPrincipalChange'
  >
  model: Pick<
    WorkspaceModel,
    'canSubmitCredential' | 'credential' | 'databaseOptions' | 'loading' | 'roleOptions'
  >
}

export function WorkspaceCredentialGate({ actions, model }: WorkspaceCredentialGateProps) {
  return (
    <div className="workspace-gate">
      <div className="workspace-gate__intro">
        <span className="workspace-gate__icon">
          <KeyRound size={20} />
        </span>
        <p className="eyebrow">Transient query identity</p>
        <h2>Connect a restricted PostgreSQL role</h2>
        <p>
          The password is sent with each authenticated workspace request but is never persisted,
          logged, or audited. SQL never uses the stored administrator credential.
        </p>
      </div>
      <form className="workspace-gate__form" onSubmit={actions.connect}>
        <label>
          <span>Database</span>
          <select onChange={actions.onDatabaseChange} value={model.credential.database}>
            {model.databaseOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Restricted login role</span>
          <select onChange={actions.onPrincipalChange} value={model.credential.principal}>
            {model.roleOptions.length === 0 && (
              <option value="">No safe login role available</option>
            )}
            {model.roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Role password</span>
          <input
            autoComplete="off"
            onChange={actions.onPasswordChange}
            type="password"
            value={model.credential.password}
          />
        </label>
        <button className="primary-button" disabled={!model.canSubmitCredential} type="submit">
          <ShieldCheck size={14} />{' '}
          {model.loading ? 'Checking access…' : 'Open read-only workspace'}
        </button>
      </form>
    </div>
  )
}
