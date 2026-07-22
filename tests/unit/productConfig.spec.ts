import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import manifest from '../../package.json'
import { getProductInfo } from '@/config/product'
import { AuthGate } from '@/features/database-manager/ui/AuthGate'

describe('running-build source disclosure', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('links an official build to its exact version tag', () => {
    vi.stubEnv('DBMASON_SOURCE_URL', '')

    expect(getProductInfo()).toMatchObject({
      name: 'DBMason',
      sourceUrl: `https://github.com/bestmaa/dbmason/tree/v${manifest.version}`,
      version: manifest.version,
    })
  })

  it('renders a deployment-provided corresponding-source URL and exact version', () => {
    vi.stubEnv('DBMASON_SOURCE_URL', 'https://code.example/dbmason/tree/deployment-7')
    const product = getProductInfo()
    const html = renderToStaticMarkup(
      createElement(AuthGate, {
        actionHref: '/admin',
        actionLabel: 'Sign in',
        description: 'Welcome back.',
        product,
        title: 'Welcome',
      }),
    )

    expect(html).toContain('https://code.example/dbmason/tree/deployment-7')
    expect(html).toContain(`Source v${manifest.version}`)
    expect(html).toContain('AGPL-3.0-only')
  })

  it('rejects non-HTTP source URL schemes', () => {
    vi.stubEnv('DBMASON_SOURCE_URL', 'javascript:alert(1)')
    expect(getProductInfo().sourceUrl).toContain('github.com/bestmaa/dbmason/tree/v')
  })
})
