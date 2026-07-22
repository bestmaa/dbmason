import { HardDrive } from 'lucide-react'

import type { ObservabilityIoViewModel } from '../../model/observabilityViewModels'

interface ObservabilityIoPanelProps {
  metrics: readonly ObservabilityIoViewModel[]
  note: string
}

export function ObservabilityIoPanel({ metrics, note }: ObservabilityIoPanelProps) {
  return (
    <section aria-label="PostgreSQL I/O" className="observability-io">
      <header>
        <div>
          <p className="eyebrow">PostgreSQL 17 pg_stat_io</p>
          <h3>
            <HardDrive aria-hidden="true" size={15} /> Cluster I/O
          </h3>
        </div>
        <small>{note}</small>
      </header>
      <div className="observability-io__grid">
        {metrics.map((metric) => (
          <article key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </div>
    </section>
  )
}
