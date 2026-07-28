import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'

import { getAppRoles } from '@/access/appRoles'
import { getServerEnv } from '@/config/env'
import { getProductInfo } from '@/config/product'
import { DatabaseManagerConnector } from '@/features/database-manager/connectors/DatabaseManagerConnector'
import { AuthGate } from '@/features/database-manager/ui/AuthGate'
import config from '@/payload.config'
import { buildServerAuthHeaders } from '@/security/serverAuthHeaders'

export default async function HomePage() {
  const product = getProductInfo()
  const payload = await getPayload({ config })
  const headers = buildServerAuthHeaders(await getHeaders(), getServerEnv().DBMASON_PUBLIC_URL)
  const [{ user }, userCount] = await Promise.all([
    payload.auth({ headers }),
    payload.count({ collection: 'users' }),
  ])

  if (!user) {
    const firstRun = userCount.totalDocs === 0
    return (
      <AuthGate
        actionHref={firstRun ? '/setup' : '/login'}
        actionLabel={firstRun ? 'Create owner account' : 'Sign in'}
        description={
          firstRun
            ? 'Create the first owner account to start managing database access.'
            : 'Sign in to view saved servers, accounts and permissions.'
        }
        product={product}
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
      product={product}
    />
  )
}
