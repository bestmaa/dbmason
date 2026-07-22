import type { ManagerActions, ManagerViewModel } from '../../model/viewModels'
import type { EnginePresentation } from '../../model/enginePresentation'
import type { EngineId } from '@/modules/database-manager/domain/contracts'
import { Modal } from '@/ui/Modal'

interface ConnectionDialogProps {
  actions: ManagerActions['connectionForm']
  error: string | null
  engineOptions: readonly { label: string; value: EngineId }[]
  onClose: () => void
  presentation: EnginePresentation
  submitting: boolean
  value: ManagerViewModel['connectionForm']
}

export function ConnectionDialog(props: ConnectionDialogProps) {
  return (
    <Modal description={`Test and securely save a ${props.presentation.displayName} administrator connection.`} error={props.error} onClose={props.onClose} title="Add connection">
      <form autoComplete="off" className="form-grid" onSubmit={props.actions.onSubmit}>
        <label className="field field--wide"><span>Database engine</span><select autoFocus onChange={props.actions.onEngineChange} value={props.value.engine}>{props.engineOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="field field--wide"><span>Connection name</span><input onChange={props.actions.onNameChange} placeholder="Production server" required value={props.value.name} /></label>
        <label className="field field--wide"><span>Host</span><input onChange={props.actions.onHostChange} placeholder="postgres.internal" required value={props.value.host} /></label>
        <label className="field"><span>Port</span><input inputMode="numeric" min="1" onChange={props.actions.onPortChange} required type="number" value={props.value.port} /></label>
        <label className="field"><span>Maintenance database</span><input onChange={props.actions.onMaintenanceDatabaseChange} required value={props.value.maintenanceDatabase} /></label>
        <label className="field"><span>Admin username</span><input autoComplete="off" onChange={props.actions.onUsernameChange} required value={props.value.username} /></label>
        <label className="field"><span>TLS mode</span><select onChange={props.actions.onSslModeChange} value={props.value.sslMode}><option value="verify-full">Verify certificate (recommended)</option><option value="require">Require TLS (certificate not verified)</option><option value="disable">Disabled (plaintext)</option><option value="prefer">Legacy prefer (may be plaintext)</option></select></label>
        <label className="field field--wide"><span>Admin password</span><input autoComplete="new-password" onChange={props.actions.onPasswordChange} required type="password" value={props.value.password} /></label>
        <p className="form-note field--wide">The saved password is AES-256-GCM encrypted. Verify certificate protects both transport and server identity; Disabled and legacy Prefer may use plaintext.</p>
        <footer className="modal__footer field--wide"><button className="button button--quiet" onClick={props.onClose} type="button">Cancel</button><button className="button button--primary" disabled={props.submitting} type="submit">{props.submitting ? 'Testing…' : 'Test & save'}</button></footer>
      </form>
    </Modal>
  )
}
