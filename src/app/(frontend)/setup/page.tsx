import { headers as getHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { getServerEnv } from '@/config/env'
import { getProductInfo } from '@/config/product'
import { TwoFactorBootstrapConnector } from '@/features/two-factor-auth/connectors/TwoFactorBootstrapConnector'
import { TwoFactorAuthShell } from '@/features/two-factor-auth/ui/TwoFactorAuthShell'
import config from '@/payload.config'
import { buildServerAuthHeaders } from '@/security/serverAuthHeaders'

export default async function SetupPage() {
  const payload = await getPayload({ config })
  const headers = buildServerAuthHeaders(await getHeaders(), getServerEnv().DBMASON_PUBLIC_URL)
  const [{ user }, userCount] = await Promise.all([
    payload.auth({ headers }),
    payload.count({ collection: 'users' }),
  ])

  if (user) redirect('/')
  if (userCount.totalDocs > 0) redirect('/login')

  return (
    <main className="dbmason-auth-page">
      <TwoFactorAuthShell
        description="Create the first owner account. You can optionally enable an authenticator later from Account security."
        product={getProductInfo()}
        title="Create your DBMason owner"
      >
        <TwoFactorBootstrapConnector apiRoute={payload.config.routes.api} loginPath="/login" />
      </TwoFactorAuthShell>
    </main>
  )
}
