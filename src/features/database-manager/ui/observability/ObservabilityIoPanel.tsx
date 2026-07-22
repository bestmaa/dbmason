import { HardDrive } from 'lucide-react'

import type { ObservabilityDetailPanelViewModel } from '../../model/observabilityViewModels'

export function ObservabilityIoPanel({ model }: { model: ObservabilityDetailPanelViewModel }) {
  return (
    <section aria-label={model.ariaLabel} className="observability-io">
      <header>
        <div>
          <p className="eyebrow">{model.eyebrow}</p>
          <h3>
            <HardDrive aria-hidden="true" size={15} /> {model.title}
          </h3>
        </div>
        <small>{model.note}</small>
      </header>
      <div className="observability-io__grid">
        {model.metrics.map((metric) => (
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
