import { isEntityHidden } from 'payload'
import type { ServerProps, VisibleEntities } from 'payload'
import { formatAdminURL } from 'payload/shared'

import { getAppRoles } from '@/access/appRoles'
import type {
  AdminDestination,
  AdminDestinationKind,
} from '@/features/admin-shell/model/adminShellModels'

const collectionKinds = {
  'access-profiles': 'access',
  'audit-events': 'audit',
  'database-connections': 'connections',
  users: 'team',
} as const satisfies Record<string, AdminDestinationKind>

type AdminShellContext = Pick<ServerProps, 'payload'> & {
  params?: ServerProps['params'] | undefined
  permissions?: ServerProps['permissions'] | undefined
  user?: ServerProps['user'] | undefined
  viewType?: ServerProps['viewType'] | undefined
  visibleEntities?: VisibleEntities | undefined
}

function visibleCollections(context: AdminShellContext): ReadonlySet<string> {
  const configured = context.visibleEntities?.collections
  if (configured) return new Set(configured)

  return new Set(
    context.payload.config.collections
      .filter(
        (collection) =>
          !isEntityHidden({
            hidden: collection.admin.hidden,
            user: context.user ?? null,
          }),
      )
      .map((collection) => collection.slug),
  )
}

function readableCollections(context: AdminShellContext): ReadonlySet<string> {
  return new Set(
    Object.entries(context.permissions?.collections ?? {})
      .filter(([, permission]) => permission.read === true)
      .map(([slug]) => slug),
  )
}

function currentCollection(context: AdminShellContext): string | null {
  const segments = context.params?.segments
  if (!Array.isArray(segments) || segments[0] !== 'collections') return null
  return segments[1] ?? null
}

function isActive(
  context: AdminShellContext,
  kind: AdminDestinationKind,
  collectionSlug?: string,
): boolean {
  if (kind === 'control') return context.viewType === 'dashboard'
  if (kind === 'account') return context.viewType === 'account'
  return collectionSlug ? currentCollection(context) === collectionSlug : false
}

function adminHref(adminRoute: string, path: `/${string}`): string {
  return formatAdminURL({ adminRoute, path })
}

export function buildAdminDestinations(context: AdminShellContext): AdminDestination[] {
  const {
    payload: {
      config: {
        routes: { admin: adminRoute },
      },
    },
  } = context
  const roles = getAppRoles(context.user)
  const canAdminister = roles.some((role) => role === 'owner' || role === 'admin')
  const canAudit = canAdminister || roles.includes('operator')
  const visible = visibleCollections(context)
  const readable = readableCollections(context)
  const destinations: AdminDestination[] = [
    {
      active: false,
      description: 'Manage database servers, accounts, grants and guarded data access.',
      href: '/',
      kind: 'manager',
      label: 'Database manager',
    },
    {
      active: isActive(context, 'control'),
      description: 'Open the DBMason application administration home.',
      href: adminRoute,
      kind: 'control',
      label: 'Control center',
    },
    {
      active: isActive(context, 'account'),
      description: 'Review your signed-in account and security settings.',
      href: adminHref(adminRoute, '/account'),
      kind: 'account',
      label: 'My account',
    },
  ]

  const collectionLinks = [
    {
      allowed: canAdminister,
      description: 'Create application accounts and assign product roles.',
      label: 'Team accounts',
      slug: 'users',
    },
    {
      allowed: canAdminister,
      description: 'Review reusable, engine-specific access templates.',
      label: 'Access profiles',
      slug: 'access-profiles',
    },
    {
      allowed: canAudit,
      description: 'Inspect append-only database management activity.',
      label: 'Audit trail',
      slug: 'audit-events',
    },
    {
      allowed: canAdminister,
      description: 'Inspect encrypted control-plane connection metadata.',
      label: 'Connection records',
      slug: 'database-connections',
    },
  ] as const

  for (const item of collectionLinks) {
    if (!item.allowed || !visible.has(item.slug) || !readable.has(item.slug)) continue
    const kind = collectionKinds[item.slug]
    destinations.push({
      active: isActive(context, kind, item.slug),
      description: item.description,
      href: adminHref(adminRoute, `/collections/${item.slug}`),
      kind,
      label: item.label,
    })
  }

  return destinations
}
