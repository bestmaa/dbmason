import { headers as getHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { getServerEnv } from '@/config/env'
import { getProductInfo } from '@/config/product'
import { TwoFactorLoginConnector } from '@/features/two-factor-auth/connectors/TwoFactorLoginConnector'
import { TwoFactorAuthShell } from '@/features/two-factor-auth/ui/TwoFactorAuthShell'
import config from '@/payload.config'
import { getSafeInternalRedirect } from '@/security/internalRedirect'
import { buildServerAuthHeaders } from '@/security/serverAuthHeaders'

type Props = {
  searchParams: Promise<{ redirect?: string | string[] }>
}

export default async function LoginPage({ searchParams }: Props) {
  const payload = await getPayload({ config })
  const { DBMASON_PUBLIC_URL } = getServerEnv()
  const headers = buildServerAuthHeaders(await getHeaders(), DBMASON_PUBLIC_URL)
  const [{ user }, userCount, params] = await Promise.all([
    payload.auth({ headers }),
    payload.count({ collection: 'users' }),
    searchParams,
  ])
  const requestedRedirect = Array.isArray(params.redirect) ? params.redirect[0] : params.redirect
  const redirectTo = getSafeInternalRedirect(requestedRedirect, DBMASON_PUBLIC_URL)

  if (user) redirect(redirectTo)
  if (userCount.totalDocs === 0) redirect('/setup')

  return (
    <main className="dbmason-auth-page">
      <TwoFactorAuthShell
        description="Use your password to enter DBMason. If you enabled 2FA, your authenticator or recovery code is also required."
        product={getProductInfo()}
        title="Welcome back"
      >
        <TwoFactorLoginConnector apiRoute={payload.config.routes.api} redirectTo={redirectTo} />
      </TwoFactorAuthShell>
    </main>
  )
}
