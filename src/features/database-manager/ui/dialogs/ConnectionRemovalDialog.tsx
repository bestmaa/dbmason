import { Trash2 } from 'lucide-react'

import { Modal } from '@/ui/Modal'

import type {
  ConnectionRemovalActions,
  ConnectionRemovalModel,
} from '../../model/lifecycleViewModels'

interface ConnectionRemovalDialogProps {
  actions: ConnectionRemovalActions
  model: ConnectionRemovalModel
}

export function ConnectionRemovalDialog({ actions, model }: ConnectionRemovalDialogProps) {
  if (!model.target) return null
  return (
    <Modal
      description="This removes only the encrypted saved connection. The managed server, databases, and accounts are not changed."
      error={model.error}
      onClose={actions.close}
      title="Remove saved connection"
    >
      <form className="lifecycle-form" onSubmit={actions.onSubmit}>
        <div className="danger-note">
          <Trash2 aria-hidden="true" size={17} />
          <p><strong>Remote data stays intact.</strong> DBMason will forget <code>{model.target.name}</code> and its stored credential.</p>
        </div>
        <label className="field">
          <span>Type <code>{model.target.name}</code> to confirm</span>
          <input autoComplete="off" onChange={actions.onConfirmationChange} value={model.confirmation} />
        </label>
        <footer className="modal__footer">
          <button className="button button--quiet" onClick={actions.close} type="button">Cancel</button>
          <button className="button button--danger" disabled={!model.canConfirm || model.submitting} type="submit">
            {model.submitting ? 'Removing…' : 'Remove connection'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
