'use client'

import { useState } from 'react'

import type { AppRole } from '@/access/appRoles'

import { sessionClient } from '../services/sessionClient'

export function useAccountActions(roles: readonly AppRole[]) {
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const canOpenControlCenter = roles.some((role) => role === 'owner' || role === 'admin')

  return {
    canOpenControlCenter,
    error,
    onOpenControlCenter: sessionClient.openControlCenter,
    onOpenSecuritySettings: sessionClient.openSecuritySettings,
    onSignOut: async () => {
      setError('')
      setSigningOut(true)
      try {
        await sessionClient.signOut()
      } catch {
        setError('Sign out failed. Check your connection and try again.')
        setSigningOut(false)
      }
    },
    signingOut,
  }
}
