import { Database, LockKeyhole } from 'lucide-react'

export interface AuthGateProps {
  actionHref: string
  actionLabel: string
  description: string
  title: string
}

export function AuthGate({ actionHref, actionLabel, description, title }: AuthGateProps) {
  return (
    <main className="auth-gate">
      <section className="auth-card">
        <span className="auth-card__mark">
          <Database size={28} />
        </span>
        <p className="eyebrow">DBMason</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <a className="button button--primary button--large" href={actionHref}>
          <LockKeyhole size={16} />
          {actionLabel}
        </a>
        <small>
          Self-hosted · Encrypted secrets · No telemetry ·{' '}
          <a href="https://github.com/bestmaa/dbmason">Source (AGPL-3.0)</a>
        </small>
      </section>
    </main>
  )
}
