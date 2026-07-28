import type { AdminViewServerProps } from 'payload'

import { getAppRoles } from '@/access/appRoles'
import { getProductInfo } from '@/config/product'
import { AdminDashboardView } from '@/features/admin-shell/ui/AdminDashboardView'

import { buildAdminDestinations } from './adminShellSupport'

export function AdminDashboardConnector({
  initPageResult,
  params,
  viewType,
}: AdminViewServerProps) {
  const {
    permissions,
    req,
    req: { user },
    visibleEntities,
  } = initPageResult
  const product = getProductInfo()
  const roles = getAppRoles(user)
  const email = user?.email ?? 'Signed-in DBMason user'
  const displayName = user?.name?.trim() || email.split('@')[0] || 'DBMason user'

  return (
    <AdminDashboardView
      destinations={buildAdminDestinations({
        params,
        payload: req.payload,
        permissions,
        user: user ?? undefined,
        viewType,
        visibleEntities,
      })}
      displayName={displayName}
      email={email}
      roleLabel={roles.length > 0 ? roles.join(' · ') : 'account'}
      sourceUrl={product.sourceUrl}
      version={product.version}
    />
  )
}
