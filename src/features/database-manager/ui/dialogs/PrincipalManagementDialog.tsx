import { KeyRound, LockKeyhole, LogIn, LogOut, ShieldAlert, Trash2 } from 'lucide-react'

import type { DatabaseSummary } from '@/modules/database-manager/domain/contracts'
import { Modal } from '@/ui/Modal'

import type {
  PrincipalManagementActions,
  PrincipalManagementModel,
} from '../../model/lifecycleViewModels'

interface PrincipalManagementDialogProps {
  actions: PrincipalManagementActions
  databases: readonly DatabaseSummary[]
  model: PrincipalManagementModel
}

export function PrincipalManagementDialog(props: PrincipalManagementDialogProps) {
  const { actions, databases, model } = props
  if (!model.principal) return null
  return (
    <Modal
      description="Manage login, rotate credentials, and apply a least-privilege database preset."
      error={model.error}
      onClose={actions.close}
      title={`Manage ${model.principal.name}`}
    >
      <div className="principal-summary">
        <span className="role-avatar">{model.principal.name.slice(0, 2).toUpperCase()}</span>
        <div><code>{model.principal.name}</code><small>{model.principal.canLogin ? 'Login enabled' : 'Login disabled'}</small></div>
        <span className={`table-status${model.principal.canLogin ? '' : ' table-status--muted'}`}>
          {model.principal.canLogin ? <LogIn size={13} /> : <LogOut size={13} />}
          {model.principal.canLogin ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <div className="lifecycle-quick-actions">
        <button className="button button--quiet" disabled={model.submitting} onClick={actions.onToggleLogin} type="button">
          <LockKeyhole size={15} /> {model.principal.canLogin ? 'Disable login' : 'Enable login'}
        </button>
        <button className="button button--quiet" disabled={model.submitting} onClick={actions.onRotatePassword} type="button">
          <KeyRound size={15} /> Rotate password
        </button>
      </div>

      <form className="lifecycle-form lifecycle-form--bordered" onSubmit={actions.onApplyAccess}>
        <div className="lifecycle-heading"><div><strong>Database access</strong><small>Applying a preset replaces DBMason-managed grants for this database.</small></div></div>
        <div className="lifecycle-fields">
          <label className="field">
            <span>Database</span>
            <select disabled={model.submitting || databases.length === 0} onChange={actions.onDatabaseChange} value={model.accessForm.database}>
              {databases.map((database) => <option key={database.name} value={database.name}>{database.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Access preset</span>
            <select disabled={model.submitting} onChange={actions.onLevelChange} value={model.accessForm.level}>
              <option value="connect">Connect only</option>
              <option value="read">Read</option>
              <option value="write">Read + write</option>
              <option value="developer">Developer</option>
            </select>
          </label>
        </div>
        {model.selectedDatabase?.publicConnect && (
          <div className="access-caveat"><ShieldAlert size={15} /><span>PUBLIC has CONNECT on this database. Revoking this user’s explicit grant alone will not block connection.</span></div>
        )}
        {model.warnings.map((warning) => <p className="inline-warning lifecycle-warning" key={warning}>{warning}</p>)}
        <div className="lifecycle-form__actions">
          <button className="button button--quiet" disabled={!model.accessForm.database || model.submitting} onClick={actions.onRevokeAccess} type="button">Revoke explicit access</button>
          <button className="button button--primary" disabled={!model.accessForm.database || model.submitting} type="submit">{model.submitting ? 'Saving…' : 'Apply preset'}</button>
        </div>
      </form>

      <form className="lifecycle-form lifecycle-danger" onSubmit={actions.onDrop}>
        <div className="lifecycle-heading"><Trash2 size={16} /><div><strong>Drop PostgreSQL role</strong><small>PostgreSQL will refuse the operation while owned objects or dependent grants remain.</small></div></div>
        <label className="field">
          <span>Type <code>{model.principal.name}</code> to confirm</span>
          <input autoComplete="off" onChange={actions.onDropConfirmationChange} value={model.dropConfirmation} />
        </label>
        <div className="lifecycle-form__actions">
          <button className="button button--danger" disabled={!model.canConfirmDrop || model.submitting} type="submit">Drop role</button>
        </div>
      </form>
    </Modal>
  )
}
