import { Database, KeyRound, ShieldCheck } from 'lucide-react'

interface OverviewCardsProps {
  databaseCount: number
  loginCount: number
  protectedCount: number
}

export function OverviewCards({ databaseCount, loginCount, protectedCount }: OverviewCardsProps) {
  return (
    <section aria-label="Server overview" className="overview-grid">
      <article className="metric-card">
        <span className="metric-card__icon metric-card__icon--blue"><Database size={17} /></span>
        <div><span>Databases</span><strong>{databaseCount}</strong></div>
        <small>Live catalog</small>
      </article>
      <article className="metric-card">
        <span className="metric-card__icon metric-card__icon--violet"><KeyRound size={17} /></span>
        <div><span>Login roles</span><strong>{loginCount}</strong></div>
        <small>Can authenticate</small>
      </article>
      <article className="metric-card">
        <span className="metric-card__icon metric-card__icon--green"><ShieldCheck size={17} /></span>
        <div><span>Privileged</span><strong>{protectedCount}</strong></div>
        <small>Review regularly</small>
      </article>
    </section>
  )
}
