export type AdminDestinationKind =
  | 'access'
  | 'account'
  | 'audit'
  | 'connections'
  | 'control'
  | 'manager'
  | 'team'

export interface AdminDestination {
  active: boolean
  description: string
  href: string
  kind: AdminDestinationKind
  label: string
}

export interface AdminDashboardViewProps {
  destinations: readonly AdminDestination[]
  displayName: string
  email: string
  roleLabel: string
  sourceUrl: string
  version: string
}

export interface AdminNavBrandProps {
  href: string
  productName: string
}

export interface AdminNavLinksProps {
  destinations: readonly AdminDestination[]
}
