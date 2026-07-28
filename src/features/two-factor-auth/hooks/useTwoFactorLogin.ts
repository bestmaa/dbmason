'use client'

import { type ChangeEvent, type FormEvent, useState } from 'react'

import type { TwoFactorState } from '../model/twoFactorAuthModels'
import { twoFactorAuthClient } from '../services/twoFactorAuthClient'

export function useTwoFactorLogin(apiRoute: string, redirectTo: string) {
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [factor, setFactor] = useState<TwoFactorState | null>(null)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const start = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const result = await twoFactorAuthClient.start(apiRoute, { email, password })
      if (!result.ok) {
        setError(result.message)
        return
      }
      if (result.value.mode === 'password') {
        setPassword('')
        twoFactorAuthClient.navigate(redirectTo)
        return
      }
      setCode('')
      setFactor(result.value)
    } catch {
      setError('Sign-in could not be started. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const complete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!factor) return
    setError('')
    setSubmitting(true)
    try {
      const result = await twoFactorAuthClient.complete(apiRoute, {
        challenge: factor.challenge,
        code,
        email,
        password,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setPassword('')
      twoFactorAuthClient.navigate(redirectTo)
    } catch {
      setError('The code could not be verified. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return {
    code,
    email,
    error,
    factor,
    onCodeChange: (event: ChangeEvent<HTMLInputElement>) => setCode(event.target.value),
    onComplete: complete,
    onEmailChange: (event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value),
    onPasswordChange: (event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value),
    onStart: start,
    onStartOver: () => {
      setCode('')
      setError('')
      setFactor(null)
    },
    password,
    submitting,
  }
}
