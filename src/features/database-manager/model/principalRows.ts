import type {
  EngineId,
  PrincipalSummary,
  ServerSnapshot,
} from '@/modules/database-manager/domain/contracts'

export interface PrincipalRowViewModel extends PrincipalSummary {
  managementDisabledReason: string | null
}

function isEngineSystemPrincipal(engine: EngineId, name: string): boolean {
  if (engine === 'postgresql') return name.startsWith('pg_')
  const account = name.split('@', 1)[0] ?? ''
  return account.startsWith('mysql.')
}

function disabledReason(
  principal: PrincipalSummary,
  currentUser: string,
  engine: EngineId,
): string | null {
  if (principal.name === currentUser) return 'The active connection role is protected.'
  if (principal.isSuperuser || principal.canCreateDatabase || principal.canCreateRole) {
    return 'Privileged roles are protected.'
  }
  if (isEngineSystemPrincipal(engine, principal.name)) {
    return 'Database system accounts are protected.'
  }
  return null
}

export function buildPrincipalRows(snapshot: ServerSnapshot | null): readonly PrincipalRowViewModel[] {
  if (!snapshot) return []
  return snapshot.principals.map((principal) => ({
    ...principal,
    managementDisabledReason: disabledReason(principal, snapshot.currentUser, snapshot.engine),
  }))
}
