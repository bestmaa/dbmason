import type { ManagerActions, ManagerViewModel } from '../../model/viewModels'
import { Modal } from '@/ui/Modal'

interface DatabaseDialogProps {
  actions: ManagerActions['databaseForm']
  error: string | null
  onClose: () => void
  submitting: boolean
  value: ManagerViewModel['databaseForm']
}

export function DatabaseDialog(props: DatabaseDialogProps) {
  return (
    <Modal description="Create a database through the selected maintenance connection." error={props.error} onClose={props.onClose} title="Create database">
      <form className="form-grid" onSubmit={props.actions.onSubmit}>
        <label className="field field--wide"><span>Database name</span><input autoFocus onChange={props.actions.onNameChange} placeholder="customer_portal" required value={props.value.name} /></label>
        <label className="field field--wide"><span>Owner role <small>Optional</small></span><input onChange={props.actions.onOwnerChange} placeholder="app_owner" value={props.value.owner} /></label>
        <p className="form-note field--wide">Database creation runs outside a transaction, as required by PostgreSQL.</p>
        <footer className="modal__footer field--wide"><button className="button button--quiet" onClick={props.onClose} type="button">Cancel</button><button className="button button--primary" disabled={props.submitting} type="submit">{props.submitting ? 'Creating…' : 'Create database'}</button></footer>
      </form>
    </Modal>
  )
}
