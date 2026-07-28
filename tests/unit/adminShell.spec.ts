import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { buildAdminDestinations } from '@/features/admin-shell/connectors/adminShellSupport'
import { AdminDashboardView } from '@/features/admin-shell/ui/AdminDashboardView'

const collectionSlugs = [
  'users',
  'access-profiles',
  'audit-events',
  'database-connections',
] as const

function destinationsFor(roles: readonly string[], segments: string[] = []) {
  const context = {
    params: { segments },
    payload: {
      config: {
        collections: collectionSlugs.map((slug) => ({ admin: { hidden: false }, slug })),
        routes: { admin: '/admin' },
      },
    },
    permissions: {
      collections: Object.fromEntries(
        collectionSlugs.map((slug) => [slug, { fields: {}, read: true }]),
      ),
    },
    user: { roles },
    viewType: segments.length === 0 ? 'dashboard' : 'list',
    visibleEntities: { collections: [...collectionSlugs], globals: [] },
  } as unknown as Parameters<typeof buildAdminDestinations>[0]

  return buildAdminDestinations(context)
}

describe('DBMason admin shell', () => {
  it('shows owners every permitted control-center destination', () => {
    expect(destinationsFor(['owner']).map(({ kind }) => kind)).toEqual([
      'manager',
      'control',
      'account',
      'team',
      'access',
      'audit',
      'connections',
    ])
  })

  it('keeps privileged navigation out of a viewer shell', () => {
    expect(destinationsFor(['viewer']).map(({ kind }) => kind)).toEqual([
      'manager',
      'control',
      'account',
    ])
  })

  it('marks the active collection without changing its direct route', () => {
    const team = destinationsFor(['admin'], ['collections', 'users']).find(
      ({ kind }) => kind === 'team',
    )
    expect(team).toMatchObject({
      active: true,
      href: '/admin/collections/users',
      label: 'Team accounts',
    })
  })

  it('renders a DBMason control center instead of generic collection cards', () => {
    const html = renderToStaticMarkup(
      createElement(AdminDashboardView, {
        destinations: destinationsFor(['owner']),
        displayName: 'Owner',
        email: 'owner@example.test',
        roleLabel: 'owner',
        sourceUrl: 'https://github.com/bestmaa/dbmason',
        version: '0.2.1',
      }),
    )

    expect(html).toContain('data-testid="dbmason-admin-dashboard"')
    expect(html).toContain('DBMason control center')
    expect(html).toContain('Open database manager')
    expect(html).not.toContain('>Collections<')
    expect(html).not.toContain('Payload')
  })
})
