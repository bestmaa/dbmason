import type {
  EngineId,
  PrincipalSummary,
} from '@/modules/database-manager/domain/contracts'

export interface WorkspaceCopy {
  credentialHeading: string
  guardEyebrow: string
  passwordLabel: string
  principalLabel: string
}

interface WorkspaceEngineStrategy {
  copy: WorkspaceCopy
  principalIsEligible: (principal: PrincipalSummary, currentUser: string | null) => boolean
}

function restrictedPrincipal(principal: PrincipalSummary, currentUser: string | null): boolean {
  return (
    principal.canLogin &&
    !principal.isSuperuser &&
    !principal.canCreateDatabase &&
    !principal.canCreateRole &&
    principal.name !== currentUser
  )
}

function restrictedMysqlAccount(
  principal: PrincipalSummary,
  currentUser: string | null,
): boolean {
  return restrictedPrincipal(principal, currentUser) && principal.memberships.length === 0
}

const strategies: Readonly<Record<EngineId, WorkspaceEngineStrategy>> = {
  mysql: {
    copy: {
      credentialHeading: 'Connect a restricted MySQL account',
      guardEyebrow: 'MySQL read-only session guard',
      passwordLabel: 'Account password',
      principalLabel: 'Restricted account',
    },
    principalIsEligible: restrictedMysqlAccount,
  },
  postgresql: {
    copy: {
      credentialHeading: 'Connect a restricted PostgreSQL role',
      guardEyebrow: 'PostgreSQL native guard',
      passwordLabel: 'Role password',
      principalLabel: 'Restricted login role',
    },
    principalIsEligible: restrictedPrincipal,
  },
}

export const workspaceStarterQuery =
  'SELECT CURRENT_USER AS principal, CURRENT_TIMESTAMP AS checked_at'

export function workspaceEngineStrategy(engine: EngineId): WorkspaceEngineStrategy {
  return strategies[engine]
}
