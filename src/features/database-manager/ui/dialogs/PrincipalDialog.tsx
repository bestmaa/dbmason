import type { DatabaseSummary } from '@/modules/database-manager/domain/contracts'
import { Modal } from '@/ui/Modal'

import type { ManagerActions, ManagerViewModel } from '../../model/viewModels'

interface PrincipalDialogProps {
  actions: ManagerActions['principalForm']
  databases: readonly DatabaseSummary[]
  error: string | null
  onClose: () => void
  submitting: boolean
  value: ManagerViewModel['principalForm']
}

export function PrincipalDialog(props: PrincipalDialogProps) {
  return (
    <Modal description="Create a LOGIN role and optionally add a database grant." error={props.error} onClose={props.onClose} title="Create database user">
      <form className="form-grid" onSubmit={props.actions.onSubmit}>
        <label className="field field--wide"><span>Username</span><input autoFocus onChange={props.actions.onNameChange} placeholder="customer_api" required value={props.value.name} /></label>
        <label className="field"><span>Database access</span><select onChange={props.actions.onDatabaseChange} value={props.value.database}><option value="">No database grant</option>{props.databases.map((database) => <option key={database.name} value={database.name}>{database.name}{database.publicConnect ? ' (PUBLIC CONNECT)' : ''}</option>)}</select></label>
        <label className="field"><span>Access preset</span><select disabled={!props.value.database} onChange={props.actions.onLevelChange} value={props.value.level}><option value="connect">Connect only</option><option value="read">Read only</option><option value="write">Read &amp; write</option><option value="developer">Developer</option></select></label>
        <div className="permission-preview field--wide"><strong>Additive access</strong><p>The preset adds privileges; it does not make access exclusive. Databases may still allow every role to connect through PostgreSQL PUBLIC. A one-time password is generated on the server.</p></div>
        <footer className="modal__footer field--wide"><button className="button button--quiet" onClick={props.onClose} type="button">Cancel</button><button className="button button--primary" disabled={props.submitting} type="submit">{props.submitting ? 'Creating…' : 'Create user'}</button></footer>
      </form>
    </Modal>
  )
}
