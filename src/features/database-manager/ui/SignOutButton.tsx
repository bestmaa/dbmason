import { LogOut } from 'lucide-react'

type Props = {
  error: string
  onSignOut: () => void
  signingOut: boolean
}

export function SignOutButton({ error, onSignOut, signingOut }: Props) {
  return (
    <span className="workspace-sign-out">
      <button
        aria-label="Sign out"
        className="workspace-account-action"
        disabled={signingOut}
        onClick={onSignOut}
        title="Sign out"
        type="button"
      >
        <LogOut aria-hidden="true" size={14} />
        <span className="workspace-account-action__label">
          {signingOut ? 'Signing out...' : 'Sign out'}
        </span>
      </button>
      {error ? (
        <span className="workspace-sign-out__error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  )
}
