'use client'

import { useTwoFactorSettings } from '../hooks/useTwoFactorSettings'
import { TwoFactorSettingsView } from '../ui/TwoFactorSettingsView'

type Props = {
  apiRoute: string
  backHref: string
  loginPath: string
}

export function TwoFactorSettingsConnector({ apiRoute, backHref, loginPath }: Props) {
  const viewProps = useTwoFactorSettings(apiRoute, loginPath)
  return <TwoFactorSettingsView {...viewProps} backHref={backHref} />
}
