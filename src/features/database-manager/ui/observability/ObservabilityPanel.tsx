import { Cpu, DatabaseZap, RefreshCw, TriangleAlert } from 'lucide-react'

import type {
  ObservabilityPanelActions,
  ObservabilityPanelModel,
} from '../../model/observabilityViewModels'
import { ObservabilityDatabaseTable } from './ObservabilityDatabaseTable'
import { ObservabilityIoPanel } from './ObservabilityIoPanel'
import { ObservabilityMetricCards } from './ObservabilityMetricCards'

interface ObservabilityPanelProps {
  actions: ObservabilityPanelActions
  model: ObservabilityPanelModel
}

export function ObservabilityPanel({ actions, model }: ObservabilityPanelProps) {
  return (
    <section aria-label="PostgreSQL observability" className="observability-panel">
      <header className="observability-header">
        <div>
          <p className="eyebrow">On-demand server snapshot</p>
          <h2>Observability</h2>
          {model.serverMode && <small>{model.serverMode}</small>}
        </div>
        <div className="observability-header__actions">
          {model.sampledAtLabel && <small>Captured {model.sampledAtLabel}</small>}
          <button
            className="button button--quiet"
            disabled={model.refreshing}
            onClick={actions.refresh}
            type="button"
          >
            <RefreshCw aria-hidden="true" className={model.refreshing ? 'spin' : ''} size={14} />
            {model.refreshing ? 'Refreshing' : 'Refresh metrics'}
          </button>
        </div>
      </header>

      <aside className="host-telemetry-note">
        <span>
          <Cpu aria-hidden="true" size={18} />
        </span>
        <div>
          <strong>Host CPU and RAM</strong>
          <p>{model.hostTelemetryMessage}</p>
        </div>
        <small>External provider</small>
      </aside>

      {model.state === 'loading' && (
        <div aria-live="polite" className="observability-state">
          <DatabaseZap className="spin" size={23} />
          <strong>Collecting PostgreSQL statistics</strong>
          <span>No background polling is used.</span>
        </div>
      )}

      {model.state === 'error' && (
        <div className="observability-state observability-state--error" role="alert">
          <TriangleAlert size={23} />
          <strong>Metrics are unavailable</strong>
          <span>{model.error}</span>
          <button className="button button--quiet" onClick={actions.refresh} type="button">
            Try again
          </button>
        </div>
      )}

      {model.state === 'ready' && (
        <>
          {model.error && (
            <div className="observability-warning" role="alert">
              {model.error}
            </div>
          )}
          <ObservabilityMetricCards metrics={model.metrics} />
          <div className="tracking-strip">
            {model.trackingNotes.map((note) => (
              <span key={note}>{note}</span>
            ))}
          </div>
          <ObservabilityIoPanel metrics={model.ioMetrics} note={model.ioNote} />
          <ObservabilityDatabaseTable rows={model.databaseRows} />
        </>
      )}
    </section>
  )
}
