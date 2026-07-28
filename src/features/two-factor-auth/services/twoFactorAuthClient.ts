import { formatAdminURL } from 'payload/shared'

import type {
  ClientResult,
  TwoFactorBootstrapInput,
  TwoFactorCompletionInput,
  TwoFactorDisableInput,
  TwoFactorEnrollmentCompletionInput,
  TwoFactorLoginStart,
  TwoFactorPasswordInput,
  TwoFactorState,
} from '../model/twoFactorAuthModels'

function optionalString(value: object, key: string): string | undefined {
  if (!(key in value)) return undefined
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'string' ? candidate : undefined
}

function responseMessage(value: unknown, fallback: string): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof value.error === 'object' &&
    value.error !== null &&
    'message' in value.error &&
    typeof value.error.message === 'string'
  ) {
    return value.error.message
  }
  return fallback
}

function factorResponse(value: unknown): TwoFactorState | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('challenge' in value) ||
    typeof value.challenge !== 'string' ||
    !('mode' in value) ||
    (value.mode !== 'enroll' && value.mode !== 'verify')
  ) {
    return null
  }
  const manualKey = optionalString(value, 'manualKey')
  const qrCodeDataUrl = optionalString(value, 'qrCodeDataUrl')
  return {
    challenge: value.challenge,
    ...(manualKey ? { manualKey } : {}),
    mode: value.mode,
    ...(qrCodeDataUrl ? { qrCodeDataUrl } : {}),
  }
}

function recoveryCodes(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || !('recoveryCodes' in value)) return []
  return Array.isArray(value.recoveryCodes)
    ? value.recoveryCodes.filter((code): code is string => typeof code === 'string')
    : []
}

async function postJson(apiRoute: string, path: `/${string}`, body: unknown) {
  const response = await fetch(formatAdminURL({ apiRoute, path }), {
    body: JSON.stringify(body),
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const data: unknown = await response.json()
  return { data, response }
}

async function getJson(apiRoute: string, path: `/${string}`) {
  const response = await fetch(formatAdminURL({ apiRoute, path }), {
    credentials: 'same-origin',
    method: 'GET',
  })
  const data: unknown = await response.json()
  return { data, response }
}

export const twoFactorAuthClient = {
  async bootstrap(
    apiRoute: string,
    input: TwoFactorBootstrapInput,
  ): Promise<ClientResult<undefined>> {
    const { data, response } = await postJson(apiRoute, '/users/two-factor/bootstrap', input)
    if (!response.ok) {
      return {
        message: responseMessage(data, 'The owner account could not be created.'),
        ok: false,
      }
    }
    return { ok: true, value: undefined }
  },

  async complete(
    apiRoute: string,
    input: TwoFactorCompletionInput,
  ): Promise<ClientResult<undefined>> {
    const { data, response } = await postJson(apiRoute, '/users/two-factor/complete', input)
    if (!response.ok) {
      return {
        message: responseMessage(data, 'The code could not be verified.'),
        ok: false,
      }
    }
    return { ok: true, value: undefined }
  },

  navigate(url: string): void {
    window.location.assign(url)
  },

  async settings(apiRoute: string): Promise<ClientResult<boolean>> {
    const { data, response } = await getJson(apiRoute, '/users/two-factor/settings')
    if (
      !response.ok ||
      typeof data !== 'object' ||
      data === null ||
      !('enabled' in data) ||
      typeof data.enabled !== 'boolean'
    ) {
      return {
        message: responseMessage(data, 'Two-factor settings could not be loaded.'),
        ok: false,
      }
    }
    return { ok: true, value: data.enabled }
  },

  async start(
    apiRoute: string,
    input: TwoFactorPasswordInput,
  ): Promise<ClientResult<TwoFactorLoginStart>> {
    const { data, response } = await postJson(apiRoute, '/users/two-factor/start', input)
    const factor = factorResponse(data)
    const passwordAuthenticated =
      typeof data === 'object' &&
      data !== null &&
      'mode' in data &&
      data.mode === 'password' &&
      'authenticated' in data &&
      data.authenticated === true
    if (!response.ok || ((!factor || factor.mode !== 'verify') && !passwordAuthenticated)) {
      return {
        message: responseMessage(data, 'Sign-in could not be started.'),
        ok: false,
      }
    }
    return {
      ok: true,
      value: factor?.mode === 'verify' ? factor : { authenticated: true, mode: 'password' },
    }
  },

  async startEnrollment(apiRoute: string, password: string): Promise<ClientResult<TwoFactorState>> {
    const { data, response } = await postJson(apiRoute, '/users/two-factor/settings/enrollment', {
      password,
    })
    const factor = factorResponse(data)
    if (!response.ok || !factor || factor.mode !== 'enroll') {
      return {
        message: responseMessage(data, 'Authenticator setup could not be started.'),
        ok: false,
      }
    }
    return { ok: true, value: factor }
  },

  async completeEnrollment(
    apiRoute: string,
    input: TwoFactorEnrollmentCompletionInput,
  ): Promise<ClientResult<string[]>> {
    const { data, response } = await postJson(
      apiRoute,
      '/users/two-factor/settings/enrollment/complete',
      input,
    )
    if (!response.ok) {
      return {
        message: responseMessage(data, 'The authenticator code could not be verified.'),
        ok: false,
      }
    }
    const codes = recoveryCodes(data)
    if (codes.length === 0) {
      return { message: 'Recovery codes were not returned safely.', ok: false }
    }
    return { ok: true, value: codes }
  },

  async disable(apiRoute: string, input: TwoFactorDisableInput): Promise<ClientResult<undefined>> {
    const { data, response } = await postJson(apiRoute, '/users/two-factor/settings/disable', input)
    if (!response.ok) {
      return {
        message: responseMessage(data, 'Two-factor authentication could not be disabled.'),
        ok: false,
      }
    }
    return { ok: true, value: undefined }
  },
}
