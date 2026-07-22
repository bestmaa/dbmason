import { Database, LockKeyhole } from 'lucide-react'
import type { ProductInfo } from '@/config/product'

export interface AuthGateProps {
  actionHref: string
  actionLabel: string
  description: string
  product: ProductInfo
  title: string
}

export function AuthGate({ actionHref, actionLabel, description, product, title }: AuthGateProps) {
  return (
    <main className="auth-gate">
      <section className="auth-card">
        <span className="auth-card__mark">
          <Database size={28} />
        </span>
        <p className="eyebrow">{product.name}</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <a className="button button--primary button--large" href={actionHref}>
          <LockKeyhole size={16} />
          {actionLabel}
        </a>
        <small>
          Self-hosted · Encrypted secrets · No telemetry ·{' '}
          <a href={product.sourceUrl}>Source v{product.version} ({product.licenseName})</a>
        </small>
      </section>
    </main>
  )
}
