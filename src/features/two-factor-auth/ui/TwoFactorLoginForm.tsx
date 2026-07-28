import type { ChangeEventHandler, FormEventHandler } from 'react'

import type { TwoFactorState } from '../model/twoFactorAuthModels'

type Props = {
  code: string
  email: string
  error: string
  factor: TwoFactorState | null
  onCodeChange: ChangeEventHandler<HTMLInputElement>
  onComplete: FormEventHandler<HTMLFormElement>
  onEmailChange: ChangeEventHandler<HTMLInputElement>
  onPasswordChange: ChangeEventHandler<HTMLInputElement>
  onStart: FormEventHandler<HTMLFormElement>
  onStartOver: () => void
  password: string
  submitting: boolean
}

export function TwoFactorLoginForm({
  code,
  email,
  error,
  factor,
  onCodeChange,
  onComplete,
  onEmailChange,
  onPasswordChange,
  onStart,
  onStartOver,
  password,
  submitting,
}: Props) {
  if (!factor) {
    return (
      <form className="dbmason-auth__form" onSubmit={onStart}>
        <label htmlFor="field-email">Email</label>
        <input
          autoComplete="email"
          id="field-email"
          onChange={onEmailChange}
          required
          type="email"
          value={email}
        />

        <label htmlFor="field-password">Password</label>
        <input
          autoComplete="current-password"
          id="field-password"
          onChange={onPasswordChange}
          required
          type="password"
          value={password}
        />

        {error ? (
          <p className="dbmason-auth__error" role="alert">
            {error}
          </p>
        ) : null}
        <button disabled={submitting} type="submit">
          {submitting ? 'Checking password…' : 'Continue'}
        </button>
      </form>
    )
  }

  return (
    <form className="dbmason-auth__form" onSubmit={onComplete}>
      <div>
        <h2>Authenticator verification</h2>
        <p>Enter the six-digit code, or use one saved recovery code.</p>
      </div>
      <label htmlFor="field-two-factor-code">Authenticator or recovery code</label>
      <input
        autoComplete="one-time-code"
        id="field-two-factor-code"
        inputMode="text"
        name="code"
        onChange={onCodeChange}
        required
        type="text"
        value={code}
      />
      {error ? (
        <p className="dbmason-auth__error" role="alert">
          {error}
        </p>
      ) : null}
      <button disabled={submitting} type="submit">
        {submitting ? 'Verifying…' : 'Sign in'}
      </button>
      <button
        className="dbmason-auth__secondary"
        disabled={submitting}
        onClick={onStartOver}
        type="button"
      >
        Start over
      </button>
    </form>
  )
}
