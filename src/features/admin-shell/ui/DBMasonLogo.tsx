import { DBMasonIcon } from './DBMasonIcon'

export function DBMasonLogo() {
  return (
    <span aria-label="DBMason" className="dbmason-admin-logo">
      <span className="dbmason-admin-logo__mark">
        <DBMasonIcon />
      </span>
      <span className="dbmason-admin-logo__copy">
        <strong>DBMason</strong>
        <small>Database access manager</small>
      </span>
    </span>
  )
}
