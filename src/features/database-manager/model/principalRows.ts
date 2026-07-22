import type {
  EngineId,
  PrincipalSummary,
  ServerSnapshot,
} from '@/modules/database-manager/domain/contracts'

export interface PrincipalRowViewModel extends PrincipalSummary {
  managementDisabledReason: string | null
}

type SystemPrincipalMatcher = (name: string) => boolean

const systemPrincipalMatchers = {
  mysql: (name) => (name.split('@', 1)[0] ?? '').startsWith('mysql.'),
  postgresql: (name) => name.startsWith('pg_'),
} satisfies Readonly<Record<EngineId, SystemPrincipalMatcher>>

function isEngineSystemPrincipal(engine: EngineId, name: string): boolean {
  return systemPrincipalMatchers[engine](name)
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
