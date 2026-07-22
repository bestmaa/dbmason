import type { ReactNode } from 'react'
import { CircleAlert, X } from 'lucide-react'

interface ModalProps {
  children: ReactNode
  description: string
  error?: string | null
  onClose: () => void
  title: string
}

export function Modal({ children, description, error, onClose, title }: ModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-describedby={error ? 'modal-description modal-error' : 'modal-description'} aria-label={title} aria-modal="true" className="modal" role="dialog">
        <header className="modal__header">
          <div>
            <p className="eyebrow">Database manager</p>
            <h2>{title}</h2>
            <p id="modal-description">{description}</p>
          </div>
          <button aria-label="Close dialog" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        {error && <div className="modal__error" id="modal-error" role="alert"><CircleAlert aria-hidden="true" size={16} /><span>{error}</span></div>}
        {children}
      </section>
    </div>
  )
}
