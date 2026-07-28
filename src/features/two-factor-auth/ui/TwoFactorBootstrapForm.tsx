import type { ChangeEventHandler, FormEventHandler } from 'react'

type Props = {
  confirmPassword: string
  email: string
  error: string
  name: string
  onConfirmPasswordChange: ChangeEventHandler<HTMLInputElement>
  onEmailChange: ChangeEventHandler<HTMLInputElement>
  onNameChange: ChangeEventHandler<HTMLInputElement>
  onPasswordChange: ChangeEventHandler<HTMLInputElement>
  onSubmit: FormEventHandler<HTMLFormElement>
  password: string
  submitting: boolean
}

export function TwoFactorBootstrapForm({
  confirmPassword,
  email,
  error,
  name,
  onConfirmPasswordChange,
  onEmailChange,
  onNameChange,
  onPasswordChange,
  onSubmit,
  password,
  submitting,
}: Props) {
  return (
    <form className="dbmason-auth__form" onSubmit={onSubmit}>
      <label htmlFor="field-name">Name</label>
      <input
        autoComplete="name"
        id="field-name"
        name="name"
        onChange={onNameChange}
        required
        type="text"
        value={name}
      />

      <label htmlFor="field-email">Email</label>
      <input
        autoComplete="email"
        id="field-email"
        name="email"
        onChange={onEmailChange}
        required
        type="email"
        value={email}
      />

      <label htmlFor="field-password">Password</label>
      <input
        autoComplete="new-password"
        id="field-password"
        minLength={12}
        name="password"
        onChange={onPasswordChange}
        required
        type="password"
        value={password}
      />
      <small>Use at least 12 characters.</small>

      <label htmlFor="field-confirm-password">Confirm password</label>
      <input
        autoComplete="new-password"
        id="field-confirm-password"
        minLength={12}
        name="confirmPassword"
        onChange={onConfirmPasswordChange}
        required
        type="password"
        value={confirmPassword}
      />

      {error ? (
        <p className="dbmason-auth__error" role="alert">
          {error}
        </p>
      ) : null}
      <button disabled={submitting} type="submit">
        {submitting ? 'Creating owner…' : 'Create owner account'}
      </button>
    </form>
  )
}
