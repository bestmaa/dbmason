'use client'

import { useTwoFactorBootstrap } from '../hooks/useTwoFactorBootstrap'
import { TwoFactorBootstrapForm } from '../ui/TwoFactorBootstrapForm'

type Props = {
  apiRoute: string
  loginPath: string
}

export function TwoFactorBootstrapConnector({ apiRoute, loginPath }: Props) {
  const viewProps = useTwoFactorBootstrap(apiRoute, loginPath)
  return <TwoFactorBootstrapForm {...viewProps} />
}
