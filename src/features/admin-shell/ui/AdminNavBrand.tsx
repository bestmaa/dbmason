import type { AdminNavBrandProps } from '../model/adminShellModels'
import { DBMasonIcon } from './DBMasonIcon'

export function AdminNavBrand({ href, productName }: AdminNavBrandProps) {
  return (
    <a
      aria-label={`Open ${productName} database manager`}
      className="dbmason-admin-nav-brand"
      href={href}
    >
      <span className="dbmason-admin-nav-brand__mark">
        <DBMasonIcon />
      </span>
      <span>
        <strong>{productName}</strong>
        <small>Control center</small>
      </span>
    </a>
  )
}
