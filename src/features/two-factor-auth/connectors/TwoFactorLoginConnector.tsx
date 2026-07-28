'use client'

import { useTwoFactorLogin } from '../hooks/useTwoFactorLogin'
import { TwoFactorLoginForm } from '../ui/TwoFactorLoginForm'

type Props = {
  apiRoute: string
  redirectTo: string
}

export function TwoFactorLoginConnector({ apiRoute, redirectTo }: Props) {
  const viewProps = useTwoFactorLogin(apiRoute, redirectTo)
  return <TwoFactorLoginForm {...viewProps} />
}
