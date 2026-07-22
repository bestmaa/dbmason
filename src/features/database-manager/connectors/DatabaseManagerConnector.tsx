'use client'

import type { ManagerIdentity } from '../model/viewModels'
import { useDatabaseManager } from '../hooks/useDatabaseManager'
import { DatabaseManagerView } from '../ui/DatabaseManagerView'

export function DatabaseManagerConnector({ identity }: { identity: ManagerIdentity }) {
  const viewProps = useDatabaseManager(identity)
  return <DatabaseManagerView {...viewProps} />
}
