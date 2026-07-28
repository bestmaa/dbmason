'use client'

import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react'

import type { TwoFactorState } from '../model/twoFactorAuthModels'
import { twoFactorAuthClient } from '../services/twoFactorAuthClient'

type SettingsStage = 'enroll' | 'loading' | 'off' | 'on' | 'recovery'

export function useTwoFactorSettings(apiRoute: string, loginPath: string) {
  const [code, setCode] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [factor, setFactor] = useState<TwoFactorState | null>(null)
  const [password, setPassword] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [stage, setStage] = useState<SettingsStage>('loading')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    void twoFactorAuthClient
      .settings(apiRoute)
      .then((result) => {
        if (!active) return
        if (!result.ok) {
          setError(result.message)
          return
        }
        setStage(result.value ? 'on' : 'off')
      })
      .catch(() => {
        if (active) setError('Two-factor settings could not be loaded.')
      })
    return () => {
      active = false
    }
  }, [apiRoute])

  const startEnrollment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const result = await twoFactorAuthClient.startEnrollment(apiRoute, password)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setCode('')
      setFactor(result.value)
      setPassword('')
      setStage('enroll')
    } catch {
      setError('Authenticator setup could not be started.')
    } finally {
      setSubmitting(false)
    }
  }

  const completeEnrollment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!factor) return
    setError('')
    setSubmitting(true)
    try {
      const result = await twoFactorAuthClient.completeEnrollment(apiRoute, {
        challenge: factor.challenge,
        code,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setCode('')
      setFactor(null)
      setRecoveryCodes(result.value)
      setStage('recovery')
    } catch {
      setError('The authenticator code could not be verified.')
    } finally {
      setSubmitting(false)
    }
  }

  const disable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!confirmed) return
    setError('')
    setSubmitting(true)
    try {
      const result = await twoFactorAuthClient.disable(apiRoute, { code, password })
      if (!result.ok) {
        setError(result.message)
        return
      }
      twoFactorAuthClient.navigate(loginPath)
    } catch {
      setError('Two-factor authentication could not be disabled.')
    } finally {
      setSubmitting(false)
    }
  }

  return {
    code,
    confirmed,
    error,
    factor,
    onCancelEnrollment: () => {
      setCode('')
      setError('')
      setFactor(null)
      setStage('off')
    },
    onCodeChange: (event: ChangeEvent<HTMLInputElement>) => setCode(event.target.value),
    onCompleteEnrollment: completeEnrollment,
    onConfirmedChange: (event: ChangeEvent<HTMLInputElement>) => setConfirmed(event.target.checked),
    onDisable: disable,
    onPasswordChange: (event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value),
    onRecoveryCodesSaved: () => twoFactorAuthClient.navigate(loginPath),
    onStartEnrollment: startEnrollment,
    password,
    recoveryCodes,
    stage,
    submitting,
  }
}
