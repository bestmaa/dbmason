import type { AdminViewServerProps } from 'payload'
import { formatAdminURL } from 'payload/shared'

import { TwoFactorBootstrapConnector } from '@/features/two-factor-auth/connectors/TwoFactorBootstrapConnector'
import { TwoFactorAuthShell } from '@/features/two-factor-auth/ui/TwoFactorAuthShell'

export function TwoFactorBootstrapView({ initPageResult }: AdminViewServerProps) {
  const {
    admin: {
      routes: { login },
    },
    routes: { admin, api },
  } = initPageResult.req.payload.config
  const loginPath = `${formatAdminURL({ adminRoute: admin, path: login })}?redirect=%2F`

  return (
    <TwoFactorAuthShell
      description="Create the first owner. You can optionally enable an authenticator later from Account security."
      title="Secure your control plane"
    >
      <TwoFactorBootstrapConnector apiRoute={api} loginPath={loginPath} />
    </TwoFactorAuthShell>
  )
}
