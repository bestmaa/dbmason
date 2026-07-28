import { headers as getHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { getServerEnv } from '@/config/env'
import { TwoFactorSettingsConnector } from '@/features/two-factor-auth/connectors/TwoFactorSettingsConnector'
import config from '@/payload.config'
import { buildServerAuthHeaders } from '@/security/serverAuthHeaders'

export default async function SecurityPage() {
  const payload = await getPayload({ config })
  const headers = buildServerAuthHeaders(await getHeaders(), getServerEnv().DBMASON_PUBLIC_URL)
  const { user } = await payload.auth({ headers })
  if (!user) redirect('/login?redirect=%2Fsecurity')

  return (
    <TwoFactorSettingsConnector
      apiRoute={payload.config.routes.api}
      backHref="/"
      loginPath="/login"
    />
  )
}
