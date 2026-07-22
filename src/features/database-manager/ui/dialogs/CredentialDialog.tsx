import { Check, Copy, KeyRound } from 'lucide-react'

import type { CreatePrincipalResult } from '@/modules/database-manager/domain/contracts'
import { Modal } from '@/ui/Modal'

interface CredentialDialogProps {
  copied: boolean
  credential: CreatePrincipalResult
  error: string | null
  onClose: () => void
  onCopy: () => void
}

export function CredentialDialog(props: CredentialDialogProps) {
  return (
    <Modal description="Copy this password now. DBMason does not store generated user passwords." error={props.error} onClose={props.onClose} title="Password ready">
      <div className="credential-card">
        <span className="credential-card__icon"><KeyRound size={22} /></span>
        <div><span>Username</span><code>{props.credential.principal}</code></div>
        <div className="credential-secret"><span>One-time password</span><code>{props.credential.oneTimePassword}</code><button className="button button--quiet" onClick={props.onCopy} type="button">{props.copied ? <Check size={15} /> : <Copy size={15} />}{props.copied ? 'Copied' : 'Copy'}</button></div>
      </div>
      {props.credential.warnings.map((warning) => <p className="inline-warning" key={warning}>{warning}</p>)}
      <footer className="modal__footer"><button className="button button--primary" onClick={props.onClose} type="button">I saved it</button></footer>
    </Modal>
  )
}
