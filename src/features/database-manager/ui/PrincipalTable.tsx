import { Check, MoreHorizontal, X } from 'lucide-react'
import type { MouseEventHandler } from 'react'

import type { PrincipalRowViewModel } from '../model/principalRows'

interface PrincipalTableProps {
  canManage: boolean
  onManage: MouseEventHandler<HTMLButtonElement>
  principals: readonly PrincipalRowViewModel[]
}

export function PrincipalTable({ canManage, onManage, principals }: PrincipalTableProps) {
  return (
    <div className="resource-table-wrap">
      <table className="resource-table">
        <caption className="sr-only">PostgreSQL users and roles</caption>
        <thead><tr><th>User or role</th><th>Login</th><th>Memberships</th><th>Capabilities</th>{canManage && <th><span className="sr-only">Actions</span></th>}</tr></thead>
        <tbody>
          {principals.map((principal) => (
            <tr key={principal.name}>
              <th scope="row"><span className="role-avatar">{principal.name.slice(0, 2).toUpperCase()}</span><code>{principal.name}</code></th>
              <td>
                <span className={`table-status${principal.canLogin ? '' : ' table-status--muted'}`}>
                  {principal.canLogin ? <Check size={13} /> : <X size={13} />}
                  {principal.canLogin ? 'Enabled' : 'No login'}
                </span>
              </td>
              <td>{principal.memberships.length ? principal.memberships.join(', ') : '—'}</td>
              <td>
                <div className="tag-list">
                  {principal.isSuperuser && <span className="tag tag--danger">Superuser</span>}
                  {principal.canCreateDatabase && <span className="tag">Create DB</span>}
                  {principal.canCreateRole && <span className="tag">Create role</span>}
                  {!principal.isSuperuser && !principal.canCreateDatabase && !principal.canCreateRole && 'Standard'}
                </div>
              </td>
              {canManage && (
                <td>
                  <button
                    aria-label={`Manage ${principal.name}`}
                    className="icon-button"
                    data-principal-name={principal.name}
                    disabled={principal.managementDisabledReason !== null}
                    onClick={onManage}
                    title={principal.managementDisabledReason ?? `Manage ${principal.name}`}
                    type="button"
                  >
                    <MoreHorizontal size={17} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
