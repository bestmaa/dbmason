export type TwoFactorState = {
  challenge: string
  manualKey?: string
  mode: 'enroll' | 'verify'
  qrCodeDataUrl?: string
}

export type TwoFactorLoginStart =
  | {
      authenticated: true
      mode: 'password'
    }
  | TwoFactorState

export type TwoFactorBootstrapInput = {
  confirmPassword: string
  email: string
  name: string
  password: string
}

export type TwoFactorPasswordInput = {
  email: string
  password: string
}

export type TwoFactorCompletionInput = TwoFactorPasswordInput & {
  challenge: string
  code: string
}

export type TwoFactorDisableInput = {
  code: string
  password: string
}

export type TwoFactorEnrollmentCompletionInput = {
  challenge: string
  code: string
}

export type ClientResult<T> =
  | {
      ok: true
      value: T
    }
  | {
      message: string
      ok: false
    }
