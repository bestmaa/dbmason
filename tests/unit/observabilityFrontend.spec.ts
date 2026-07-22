import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { buildObservabilityPanelModel } from '@/features/database-manager/model/observabilityViewModels'
import { ObservabilityPanel } from '@/features/database-manager/ui/observability/ObservabilityPanel'

import { mysqlObservabilityFixture, observabilityFixture } from './observabilityFixture'

describe('observability presentation', () => {
  it('formats cluster load and large database counters without losing precision', () => {
    const model = buildObservabilityPanelModel({
      engine: 'postgresql',
      error: null,
      pending: false,
      snapshot: observabilityFixture(),
    })

    expect(model.state).toBe('ready')
    expect(model.metrics.map(({ value }) => value)).toEqual(['12 / 100', '3', '1', '1', '2'])
    expect(model.databaseTable.rows[0]?.values).toEqual([
      '4',
      '12,345,678,901,234,567,890 / 5',
      '99.5%',
      '1.0 MB · 3 files',
      '2',
      '1.0 GB',
    ])
    expect(model.serverMode).toBe('Primary · uptime 2 d 2 hr')
    expect(model.sampledAtLabel).toBe('2026-07-20 12:00:00 UTC')
  })

  it('does not turn restricted activity into false zero values', () => {
    const model = buildObservabilityPanelModel({
      engine: 'postgresql',
      error: null,
      pending: false,
      snapshot: observabilityFixture({
        activity: { reason: 'remote-stats-privilege-required', status: 'unavailable' },
      }),
    })

    expect(model.metrics.slice(1).every(({ value }) => value === 'Restricted')).toBe(true)
    expect(model.metrics[1]?.detail).toContain('pg_read_all_stats')
  })

  it('renders the external CPU and RAM boundary and a stale refresh warning', () => {
    const model = buildObservabilityPanelModel({
      engine: 'postgresql',
      error: 'The newest sample could not be collected.',
      pending: true,
      snapshot: observabilityFixture(),
    })
    const html = renderToStaticMarkup(
      createElement(ObservabilityPanel, {
        actions: { refresh: () => undefined },
        model,
      }),
    )

    expect(html).toContain('Host CPU and RAM')
    expect(html).toContain('external metrics provider')
    expect(html).toContain('The newest sample could not be collected.')
    expect(html).toContain('12 / 100')
    expect(html).toContain('app')
  })

  it('renders only native MySQL status and inventory semantics', () => {
    const model = buildObservabilityPanelModel({
      engine: 'mysql',
      error: null,
      pending: false,
      snapshot: mysqlObservabilityFixture(),
    })
    const html = renderToStaticMarkup(
      createElement(ObservabilityPanel, {
        actions: { refresh: () => undefined },
        model,
      }),
    )

    expect(html).toContain('MySQL native global status')
    expect(html).toContain('Cross-session activity available')
    expect(html).not.toContain('Performance Schema activity')
    expect(html).toContain('Threads running')
    expect(html).toContain('utf8mb4_0900_ai_ci')
    expect(html).not.toContain('PostgreSQL')
    expect(html).not.toContain('pg_stat_io')
    expect(html).not.toContain('Deadlocks')
    expect(html).not.toContain('Cache hit')
  })

  it('distinguishes first-load and fatal-error states', () => {
    expect(
      buildObservabilityPanelModel({
        engine: 'mysql',
        error: null,
        pending: true,
        snapshot: null,
      }).state,
    ).toBe('loading')
    expect(
      buildObservabilityPanelModel({
        engine: 'postgresql',
        error: 'PostgreSQL unavailable.',
        pending: false,
        snapshot: null,
      }).state,
    ).toBe('error')
  })
})
