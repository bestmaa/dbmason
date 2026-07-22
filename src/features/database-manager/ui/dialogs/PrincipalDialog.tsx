import { Modal } from '@/ui/Modal'

import type { ManagerActions, ManagerViewModel } from '../../model/viewModels'
import type { EnginePresentation } from '../../model/enginePresentation'
import type { AccessLevelOption } from '../../model/accessLevelOptions'
import type { DatabaseOption } from '../../model/databaseResources'

interface PrincipalDialogProps {
  accessOptions: readonly AccessLevelOption[]
  actions: ManagerActions['principalForm']
  databases: readonly DatabaseOption[]
  error: string | null
  onClose: () => void
  presentation: EnginePresentation['principal']
  submitting: boolean
  value: ManagerViewModel['principalForm']
}

export function PrincipalDialog(props: PrincipalDialogProps) {
  return (
    <Modal description={props.presentation.createDescription} error={props.error} onClose={props.onClose} title={props.presentation.createTitle}>
      <form className="form-grid" onSubmit={props.actions.onSubmit}>
        <label className="field field--wide"><span>Username</span><input autoFocus onChange={props.actions.onNameChange} placeholder="customer_api" required value={props.value.name} /></label>
        <label className="field"><span>Database access</span><select onChange={props.actions.onDatabaseChange} value={props.value.database}><option value="">No database grant</option>{props.databases.map((database) => <option key={database.value} value={database.value}>{database.label}</option>)}</select></label>
        <label className="field"><span>Access preset</span><select disabled={!props.value.database || props.accessOptions.length === 0} onChange={props.actions.onLevelChange} value={props.value.level}>{props.accessOptions.length === 0 && <option value="">No supported preset</option>}{props.accessOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <div className="permission-preview field--wide"><strong>Additive access</strong><p>{props.presentation.createNote} {props.presentation.accessNote}</p></div>
        <footer className="modal__footer field--wide"><button className="button button--quiet" onClick={props.onClose} type="button">Cancel</button><button className="button button--primary" disabled={props.submitting} type="submit">{props.submitting ? 'Creating…' : 'Create user'}</button></footer>
      </form>
    </Modal>
  )
}
