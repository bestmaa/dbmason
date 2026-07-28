import { Database } from 'lucide-react'
import type { ReactNode } from 'react'

import type { ProductInfo } from '@/config/product'

type Props = {
  children: ReactNode
  description: string
  product?: ProductInfo
  title: string
}

export function TwoFactorAuthShell({ children, description, product, title }: Props) {
  return (
    <section className="dbmason-auth" data-testid="dbmason-auth">
      <span className="dbmason-auth__brand" aria-hidden="true">
        <Database size={24} />
      </span>
      <p className="dbmason-auth__eyebrow">DBMason</p>
      <h1>{title}</h1>
      <p className="dbmason-auth__intro">{description}</p>
      {children}
      {product ? (
        <small className="dbmason-auth__legal">
          Self-hosted · Encrypted secrets · No product telemetry
          <br />
          {product.copyrightNotice} · {product.licenseName} ·{' '}
          <a href={product.sourceUrl}>Source v{product.version}</a>
        </small>
      ) : null}
    </section>
  )
}
