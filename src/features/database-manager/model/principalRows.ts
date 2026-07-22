import type { PrincipalSummary, ServerSnapshot } from '@/modules/database-manager/domain/contracts'

export interface PrincipalRowViewModel extends PrincipalSummary {
  managementDisabledReason: string | null
}

function disabledReason(principal: PrincipalSummary, currentUser: string): string | null {
  if (principal.name === currentUser) return 'The active connection role is protected.'
  if (principal.isSuperuser || principal.canCreateDatabase || principal.canCreateRole) {
    return 'Privileged roles are protected.'
  }
  if (principal.name.startsWith('pg_')) return 'PostgreSQL system roles are protected.'
  return null
}

export function buildPrincipalRows(snapshot: ServerSnapshot | null): readonly PrincipalRowViewModel[] {
  if (!snapshot) return []
  return snapshot.principals.map((principal) => ({
    ...principal,
    managementDisabledReason: disabledReason(principal, snapshot.currentUser),
  }))
}
