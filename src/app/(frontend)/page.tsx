import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'

import { getAppRoles } from '@/access/appRoles'
import { DatabaseManagerConnector } from '@/features/database-manager/connectors/DatabaseManagerConnector'
import { AuthGate } from '@/features/database-manager/ui/AuthGate'
import config from '@/payload.config'

export default async function HomePage() {
  const payload = await getPayload({ config })
  const headers = await getHeaders()
  const [{ user }, userCount] = await Promise.all([
    payload.auth({ headers }),
    payload.count({ collection: 'users' }),
  ])

  if (!user) {
    const firstRun = userCount.totalDocs === 0
    return (
      <AuthGate
        actionHref="/admin"
        actionLabel={firstRun ? 'Create owner account' : 'Sign in'}
        description={
          firstRun
            ? 'Create the first owner account to start managing PostgreSQL access.'
            : 'Sign in to view saved servers, roles and permissions.'
        }
        title={firstRun ? 'Secure your control plane' : 'Welcome back'}
      />
    )
  }

  return (
    <DatabaseManagerConnector
      identity={{
        email: user.email,
        name: user.name || user.email.split('@')[0] || 'Operator',
        roles: getAppRoles(user),
      }}
    />
  )
}
