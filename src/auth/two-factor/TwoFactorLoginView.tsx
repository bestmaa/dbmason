import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'

import { getServerEnv } from '@/config/env'
import { TwoFactorLoginConnector } from '@/features/two-factor-auth/connectors/TwoFactorLoginConnector'
import { TwoFactorAuthShell } from '@/features/two-factor-auth/ui/TwoFactorAuthShell'
import { getSafeInternalRedirect } from '@/security/internalRedirect'

export function TwoFactorLoginView({ initPageResult, searchParams }: AdminViewServerProps) {
  const {
    req,
    req: {
      payload: {
        config: {
          routes: { api },
        },
      },
    },
  } = initPageResult
  const redirectTo = getSafeInternalRedirect(
    searchParams?.redirect,
    getServerEnv().DBMASON_PUBLIC_URL,
  )
  if (req.user) redirect(redirectTo)

  return (
    <TwoFactorAuthShell
      description="Enter your password. A time-based or recovery code is requested only when you enabled 2FA."
      title="Sign in securely"
    >
      <TwoFactorLoginConnector apiRoute={api} redirectTo={redirectTo} />
    </TwoFactorAuthShell>
  )
}
