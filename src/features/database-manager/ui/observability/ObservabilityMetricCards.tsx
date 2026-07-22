import { Activity, CircleDot, Clock3, LockKeyhole, Network } from 'lucide-react'

import type { ObservabilityMetricViewModel } from '../../model/observabilityViewModels'

const icons = [Network, Activity, LockKeyhole, CircleDot, Clock3] as const

export function ObservabilityMetricCards({
  metrics,
}: {
  metrics: readonly ObservabilityMetricViewModel[]
}) {
  return (
    <section aria-label="PostgreSQL load" className="observability-metrics">
      {metrics.map((metric, index) => {
        const Icon = icons[index] ?? Activity
        return (
          <article className={`load-card load-card--${metric.tone}`} key={metric.label}>
            <span className="load-card__icon"><Icon aria-hidden="true" size={16} /></span>
            <div>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </div>
          </article>
        )
      })}
    </section>
  )
}
