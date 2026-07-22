import { CircleAlert, Database, LoaderCircle, Plus } from 'lucide-react'

interface EmptyStateProps {
  canAdd: boolean
  onAdd: () => void
}

export function EmptyState({ canAdd, onAdd }: EmptyStateProps) {
  return (
    <section className="workspace-state">
      <span className="workspace-state__icon"><Database size={26} /></span>
      <p className="eyebrow">No saved servers</p>
      <h1>Connect your first database</h1>
      <p>{canAdd ? 'Add a PostgreSQL administrator connection. Credentials are encrypted before they reach SQLite.' : 'No connections are available to your read-only account. Ask an operator to add one.'}</p>
      {canAdd && <button className="button button--primary" onClick={onAdd} type="button"><Plus size={16} /> Add connection</button>}
    </section>
  )
}

export function LoadingState() {
  return (
    <section aria-live="polite" className="workspace-state workspace-state--loading">
      <LoaderCircle className="spin" size={28} />
      <h1>Reading the live catalog</h1>
      <p>Only the selected server is queried.</p>
    </section>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="workspace-state">
      <span className="workspace-state__icon workspace-state__icon--error"><CircleAlert size={26} /></span>
      <p className="eyebrow">Connection unavailable</p>
      <h1>We could not load this server</h1>
      <p>{message}</p>
      <button className="button button--primary" onClick={onRetry} type="button">Try again</button>
    </section>
  )
}
