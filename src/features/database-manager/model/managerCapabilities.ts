import type { AppRole } from '@/access/appRoles'
import type { ServerSnapshot } from '@/modules/database-manager/domain/contracts'

export interface ManagerCapabilities {
  canCreateConnection: boolean
  canCreateDatabase: boolean
  canCreatePrincipal: boolean
  canDeleteConnection: boolean
  canManagePrincipals: boolean
  canUseWorkspace: boolean
  canViewObservability: boolean
}

const operatorRoles: readonly AppRole[] = ['owner', 'admin', 'operator']
const connectionAdministratorRoles: readonly AppRole[] = ['owner', 'admin']

export function resolveManagerCapabilities(
  roles: readonly AppRole[],
  engine: ServerSnapshot['capabilities'] | null,
): ManagerCapabilities {
  const canOperate = roles.some((role) => operatorRoles.includes(role))
  const canDeleteConnection = roles.some((role) => connectionAdministratorRoles.includes(role))
  const canManagePrincipals = canOperate && Boolean(engine?.canCreatePrincipal)

  return {
    canCreateConnection: canOperate,
    canCreateDatabase: canOperate && Boolean(engine?.canCreateDatabase),
    canCreatePrincipal: canManagePrincipals,
    canDeleteConnection,
    canManagePrincipals,
    canUseWorkspace: canOperate && Boolean(engine?.supportsReadOnlyWorkspace),
    canViewObservability: Boolean(engine?.supportsObservability),
  }
}
