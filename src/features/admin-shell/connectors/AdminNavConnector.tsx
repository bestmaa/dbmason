import type { ServerProps } from 'payload'

import { getProductInfo } from '@/config/product'
import { AdminNavBrand } from '@/features/admin-shell/ui/AdminNavBrand'
import { AdminNavLinks } from '@/features/admin-shell/ui/AdminNavLinks'

import { buildAdminDestinations } from './adminShellSupport'

export function AdminNavBrandConnector() {
  const product = getProductInfo()
  return <AdminNavBrand href="/" productName={product.name} />
}

export function AdminNavLinksConnector(props: ServerProps) {
  return <AdminNavLinks destinations={buildAdminDestinations(props)} />
}
