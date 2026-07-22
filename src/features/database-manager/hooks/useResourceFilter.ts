import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'

import type { DatabaseSummary } from '@/modules/database-manager/domain/contracts'

import { databaseSearchValues } from '../model/databaseResources'
import type { PrincipalRowViewModel } from '../model/principalRows'

function includesFilter(values: readonly string[], filter: string): boolean {
  return values.some((value) => value.toLocaleLowerCase().includes(filter))
}

export function useResourceFilter(
  databases: readonly DatabaseSummary[],
  principals: readonly PrincipalRowViewModel[],
) {
  const [value, setValue] = useState('')
  const normalized = value.trim().toLocaleLowerCase()

  const visibleDatabases = useMemo(
    () =>
      normalized.length === 0
        ? databases
        : databases.filter((database) =>
            includesFilter(databaseSearchValues(database), normalized),
          ),
    [databases, normalized],
  )
  const visiblePrincipals = useMemo(
    () =>
      normalized.length === 0
        ? principals
        : principals.filter((principal) =>
            includesFilter(
              [
                principal.name,
                ...principal.memberships,
                principal.canLogin ? 'login' : 'no login',
                principal.isSuperuser || principal.canCreateDatabase || principal.canCreateRole
                  ? 'privileged'
                  : 'restricted',
              ],
              normalized,
            ),
          ),
    [normalized, principals],
  )

  return {
    clear: () => setValue(''),
    onChange: (event: ChangeEvent<HTMLInputElement>) => setValue(event.currentTarget.value),
    value,
    visibleDatabases,
    visiblePrincipals,
  }
}
