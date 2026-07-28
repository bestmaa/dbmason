'use client'

import { type ChangeEvent, type FormEvent, useState } from 'react'

import { twoFactorAuthClient } from '../services/twoFactorAuthClient'

export function useTwoFactorBootstrap(apiRoute: string, loginPath: string) {
  const [confirmPassword, setConfirmPassword] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const result = await twoFactorAuthClient.bootstrap(apiRoute, {
        confirmPassword,
        email,
        name,
        password,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      twoFactorAuthClient.navigate(loginPath)
    } catch {
      setError('The owner account could not be created. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return {
    confirmPassword,
    email,
    error,
    name,
    onConfirmPasswordChange: (event: ChangeEvent<HTMLInputElement>) =>
      setConfirmPassword(event.target.value),
    onEmailChange: (event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value),
    onNameChange: (event: ChangeEvent<HTMLInputElement>) => setName(event.target.value),
    onPasswordChange: (event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value),
    onSubmit: submit,
    password,
    submitting,
  }
}
