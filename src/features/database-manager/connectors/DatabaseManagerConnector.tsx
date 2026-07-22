'use client'

import type { ManagerIdentity } from '../model/viewModels'
import type { ProductInfo } from '@/config/product'
import { useDatabaseManager } from '../hooks/useDatabaseManager'
import { DatabaseManagerView } from '../ui/DatabaseManagerView'

interface DatabaseManagerConnectorProps {
  identity: ManagerIdentity
  product: ProductInfo
}

export function DatabaseManagerConnector({ identity, product }: DatabaseManagerConnectorProps) {
  const viewProps = useDatabaseManager(identity)
  return <DatabaseManagerView {...viewProps} product={product} />
}
