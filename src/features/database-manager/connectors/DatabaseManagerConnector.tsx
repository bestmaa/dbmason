'use client'

import type { ManagerIdentity } from '../model/viewModels'
import type { ProductInfo } from '@/config/product'
import { useAccountActions } from '../hooks/useAccountActions'
import { useDatabaseManager } from '../hooks/useDatabaseManager'
import { DatabaseManagerView } from '../ui/DatabaseManagerView'

interface DatabaseManagerConnectorProps {
  identity: ManagerIdentity
  product: ProductInfo
}

export function DatabaseManagerConnector({ identity, product }: DatabaseManagerConnectorProps) {
  const viewProps = useDatabaseManager(identity)
  const account = useAccountActions(identity.roles)
  return <DatabaseManagerView {...viewProps} account={account} product={product} />
}
