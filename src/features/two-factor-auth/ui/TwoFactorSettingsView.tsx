import { KeyRound, ShieldCheck, ShieldOff } from 'lucide-react'
import type { ChangeEventHandler, FormEventHandler } from 'react'

import type { TwoFactorState } from '../model/twoFactorAuthModels'

type Props = {
  backHref: string
  code: string
  confirmed: boolean
  error: string
  factor: TwoFactorState | null
  onCancelEnrollment: () => void
  onCodeChange: ChangeEventHandler<HTMLInputElement>
  onCompleteEnrollment: FormEventHandler<HTMLFormElement>
  onConfirmedChange: ChangeEventHandler<HTMLInputElement>
  onDisable: FormEventHandler<HTMLFormElement>
  onPasswordChange: ChangeEventHandler<HTMLInputElement>
  onRecoveryCodesSaved: () => void
  onStartEnrollment: FormEventHandler<HTMLFormElement>
  password: string
  recoveryCodes: readonly string[]
  stage: 'enroll' | 'loading' | 'off' | 'on' | 'recovery'
  submitting: boolean
}

function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="security-card__error" role="alert">
      {message}
    </p>
  ) : null
}

export function TwoFactorSettingsView(props: Props) {
  const {
    backHref,
    code,
    confirmed,
    error,
    factor,
    onCancelEnrollment,
    onCodeChange,
    onCompleteEnrollment,
    onConfirmedChange,
    onDisable,
    onPasswordChange,
    onRecoveryCodesSaved,
    onStartEnrollment,
    password,
    recoveryCodes,
    stage,
    submitting,
  } = props

  return (
    <main className="security-page">
      <section className="security-card">
        <a className="security-card__back" href={backHref}>
          ← Back to database manager
        </a>
        <span className="security-card__icon" aria-hidden="true">
          <KeyRound size={24} />
        </span>
        <p className="security-card__eyebrow">Account security</p>
        <h1>Two-factor authentication</h1>

        {stage === 'loading' ? (
          <div className="security-card__status">
            <p>Loading your security status…</p>
            <ErrorMessage message={error} />
          </div>
        ) : null}

        {stage === 'off' ? (
          <>
            <div className="security-card__status is-off">
              <ShieldOff aria-hidden="true" size={20} />
              <div>
                <strong>2FA is off</strong>
                <p>Your account currently signs in with its password only.</p>
              </div>
            </div>
            <form className="security-card__form" onSubmit={onStartEnrollment}>
              <p>
                Enable an authenticator only if you want it. Google Authenticator, Microsoft
                Authenticator and other TOTP apps are supported.
              </p>
              <label htmlFor="security-current-password">Current password</label>
              <input
                autoComplete="current-password"
                id="security-current-password"
                onChange={onPasswordChange}
                required
                type="password"
                value={password}
              />
              <ErrorMessage message={error} />
              <button disabled={submitting} type="submit">
                {submitting ? 'Checking password…' : 'Set up authenticator'}
              </button>
            </form>
          </>
        ) : null}

        {stage === 'enroll' && factor ? (
          <form className="security-card__form" onSubmit={onCompleteEnrollment}>
            <div className="security-card__setup">
              <h2>Scan the QR code</h2>
              <p>Nothing is enabled until you verify one current six-digit code.</p>
              {factor.qrCodeDataUrl ? (
                // The QR remains a local data URL; the secret is never sent to an image host.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt="DBMason authenticator QR code"
                  height="240"
                  src={factor.qrCodeDataUrl}
                  width="240"
                />
              ) : null}
              <small>Manual setup key</small>
              <code data-testid="two-factor-manual-key">{factor.manualKey}</code>
            </div>
            <label htmlFor="security-enrollment-code">Six-digit code</label>
            <input
              autoComplete="one-time-code"
              id="security-enrollment-code"
              inputMode="numeric"
              onChange={onCodeChange}
              pattern="\d{6}"
              required
              type="text"
              value={code}
            />
            <ErrorMessage message={error} />
            <button disabled={submitting} type="submit">
              {submitting ? 'Verifying…' : 'Enable 2FA'}
            </button>
            <button
              className="security-card__secondary"
              disabled={submitting}
              onClick={onCancelEnrollment}
              type="button"
            >
              Cancel
            </button>
          </form>
        ) : null}

        {stage === 'recovery' ? (
          <div className="security-card__recovery">
            <h2>Save these recovery codes</h2>
            <p>Each code works once. Store them offline; DBMason will not show them again.</p>
            <ul data-testid="two-factor-recovery-codes">
              {recoveryCodes.map((recoveryCode) => (
                <li key={recoveryCode}>
                  <code>{recoveryCode}</code>
                </li>
              ))}
            </ul>
            <p>Your old sessions were signed out so that 2FA cannot be bypassed.</p>
            <p>
              The setup code you just used cannot be reused. Wait for the next authenticator code,
              or sign in with one recovery code.
            </p>
            <button onClick={onRecoveryCodesSaved} type="button">
              I saved them — sign in again
            </button>
          </div>
        ) : null}

        {stage === 'on' ? (
          <>
            <div className="security-card__status is-on">
              <ShieldCheck aria-hidden="true" size={20} />
              <div>
                <strong>2FA is on</strong>
                <p>Your password and authenticator protect this account.</p>
              </div>
            </div>
            <form className="security-card__form" onSubmit={onDisable}>
              <h2>Disable two-factor authentication</h2>
              <p className="security-card__warning">
                After disabling, anyone with this account password can sign in.
              </p>
              <label htmlFor="security-disable-password">Current password</label>
              <input
                autoComplete="current-password"
                id="security-disable-password"
                onChange={onPasswordChange}
                required
                type="password"
                value={password}
              />
              <label htmlFor="security-disable-code">Authenticator or recovery code</label>
              <input
                autoComplete="one-time-code"
                id="security-disable-code"
                onChange={onCodeChange}
                required
                type="text"
                value={code}
              />
              <label className="security-card__confirm">
                <input checked={confirmed} onChange={onConfirmedChange} required type="checkbox" />I
                understand that password-only login will be restored.
              </label>
              <ErrorMessage message={error} />
              <button className="security-card__danger" disabled={submitting} type="submit">
                {submitting ? 'Disabling…' : 'Disable 2FA'}
              </button>
            </form>
          </>
        ) : null}
      </section>
    </main>
  )
}
