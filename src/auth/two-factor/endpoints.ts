import { randomUUID } from 'node:crypto'

import QRCode from 'qrcode'
import {
  APIError,
  commitTransaction,
  executeAuthStrategies,
  initTransaction,
  killTransaction,
  logoutOperation,
  type Endpoint,
  type PayloadRequest,
} from 'payload'
import { z } from 'zod'

import { getServerEnv } from '@/config/env'

import {
  clearTwoFactorChallenge,
  consumeTwoFactorChallenge,
  createTwoFactorChallenge,
  maximumChallengeAttempts,
  readTwoFactorChallenge,
  recordChallengeFailure,
} from './challengeStore'
import { applyTwoFactorMutation, type FactorMutation, passwordCheckContext } from './loginContext'
import { buildTotpUri, generateTotpSecret, verifyTotpCode } from './totp'
import {
  decryptTotpSecret,
  encryptTotpSecret,
  findRecoveryCodeHash,
  generateRecoveryCodes,
  hashRecoveryCode,
} from './vault'
import { isTwoFactorLocked, readTwoFactorUser, registerTwoFactorFailure } from './userState'
import { writeAuditEvent } from '@/modules/database-manager/infrastructure/payload/auditWriter'

const maximumAuthBodyBytes = 8 * 1024
const invalidCredentialsMessage =
  'The email or password is invalid, or the account is temporarily locked.'
let authenticationQueue: Promise<void> = Promise.resolve()

const bootstrapSchema = z
  .object({
    confirmPassword: z.string(),
    email: z.string().trim().email(),
    name: z.string().trim().min(1).max(120),
    password: z.string().min(12).max(256),
  })
  .strict()
  .refine(({ confirmPassword, password }) => confirmPassword === password, {
    message: 'The passwords do not match.',
    path: ['confirmPassword'],
  })

const startSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(1).max(256),
  })
  .strict()

const completeSchema = startSchema
  .extend({
    challenge: z.string().regex(/^[A-Za-z\d_-]{43}$/u),
    code: z.string().trim().min(1).max(64),
  })
  .strict()

const passwordSchema = z
  .object({
    password: z.string().min(1).max(256),
  })
  .strict()

const enrollmentCompleteSchema = z
  .object({
    challenge: z.string().regex(/^[A-Za-z\d_-]{43}$/u),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/u),
  })
  .strict()

const disableSchema = z
  .object({
    code: z.string().trim().min(1).max(64),
    password: z.string().min(1).max(256),
  })
  .strict()

class TwoFactorEndpointError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly persistChanges = false,
  ) {
    super(message)
    this.name = 'TwoFactorEndpointError'
  }
}

async function serializeAuthentication<T>(operation: () => Promise<T>): Promise<T> {
  // Payload persists sessions from a user snapshot. The supported SQLite deployment has one
  // application replica, so serializing auth mutations prevents those snapshots from racing
  // TOTP counters, recovery-code consumption, and failure lockouts.
  const previous = authenticationQueue
  let release: () => void = () => undefined
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  authenticationQueue = previous.then(() => current)
  await previous
  try {
    return await operation()
  } finally {
    release()
  }
}

function noStoreJson(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders)
  headers.set('Cache-Control', 'no-store, max-age=0')
  headers.set('Pragma', 'no-cache')
  return Response.json(data, { headers, status })
}

function assertSameOrigin(req: PayloadRequest): void {
  if (req.headers.get('origin') !== getServerEnv().DBMASON_PUBLIC_URL) {
    throw new TwoFactorEndpointError('ORIGIN_REJECTED', 'The request origin is not allowed.', 403)
  }
}

async function parseBody<T>(req: PayloadRequest, schema: z.ZodType<T>): Promise<T> {
  const declaredLength = Number(req.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumAuthBodyBytes) {
    throw new TwoFactorEndpointError('REQUEST_TOO_LARGE', 'The request body is too large.', 413)
  }

  if (!req.body) {
    try {
      if (!req.json) throw new Error('Request JSON reader is unavailable')
      const fallbackBody: unknown = await req.json()
      if (Buffer.byteLength(JSON.stringify(fallbackBody), 'utf8') > maximumAuthBodyBytes) {
        throw new TwoFactorEndpointError('REQUEST_TOO_LARGE', 'The request body is too large.', 413)
      }
      return schema.parse(fallbackBody)
    } catch (error) {
      if (error instanceof TwoFactorEndpointError || error instanceof z.ZodError) throw error
      throw new TwoFactorEndpointError('INVALID_INPUT', 'A valid JSON body is required.', 400)
    }
  }

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let receivedBytes = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    receivedBytes += chunk.value.byteLength
    if (receivedBytes > maximumAuthBodyBytes) {
      await reader.cancel().catch(() => undefined)
      throw new TwoFactorEndpointError('REQUEST_TOO_LARGE', 'The request body is too large.', 413)
    }
    chunks.push(chunk.value)
  }

  const encoded = new Uint8Array(receivedBytes)
  let offset = 0
  for (const chunk of chunks) {
    encoded.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(encoded))
    return schema.parse(body)
  } catch (error) {
    if (error instanceof z.ZodError) throw error
    throw new TwoFactorEndpointError('INVALID_INPUT', 'A valid JSON body is required.', 400)
  }
}

function isPayloadAuthenticationError(error: unknown): boolean {
  return error instanceof APIError && [401, 403, 423].includes(error.status)
}

async function revokeTransientSession(req: PayloadRequest, token: string): Promise<void> {
  const { user } = await executeAuthStrategies({
    headers: new Headers({ Authorization: `Bearer ${token}` }),
    payload: req.payload,
  })
  if (!user) throw new Error('Unable to revoke the transient password-check session')

  const originalUser = req.user
  req.user = user
  try {
    await logoutOperation({
      collection: req.payload.collections.users,
      req,
    })
  } finally {
    req.user = originalUser
  }
}

async function createPrivatePasswordSession(req: PayloadRequest, email: string, password: string) {
  try {
    const result = await req.payload.login({
      collection: 'users',
      context: passwordCheckContext(),
      data: { email, password },
      overrideAccess: false,
      req: { headers: new Headers() },
    })
    if (!result.token || !result.user) throw new Error('Password check did not return a session')
    return {
      exp: result.exp,
      token: result.token,
      user: result.user,
    }
  } catch (error) {
    if (isPayloadAuthenticationError(error)) {
      throw new TwoFactorEndpointError('INVALID_CREDENTIALS', invalidCredentialsMessage, 401)
    }
    throw error
  }
}

async function verifyPassword(req: PayloadRequest, email: string, password: string) {
  const result = await createPrivatePasswordSession(req, email, password)
  await revokeTransientSession(req, result.token)
  return result.user
}

function payloadAuthCookie(req: PayloadRequest, token: string): string {
  const auth = req.payload.collections.users.config.auth
  if (!auth) throw new Error('Users authentication is not configured')

  const cookie = [
    `${req.payload.config.cookiePrefix}-token=${token}`,
    'Path=/',
    'HttpOnly',
    `Expires=${new Date(Date.now() + auth.tokenExpiration * 1000).toUTCString()}`,
  ]
  if (auth.cookies.domain) cookie.push(`Domain=${auth.cookies.domain}`)
  if (auth.cookies.secure || auth.cookies.sameSite === 'None') cookie.push('Secure')
  if (auth.cookies.sameSite) {
    cookie.push(
      `SameSite=${typeof auth.cookies.sameSite === 'string' ? auth.cookies.sameSite : 'Strict'}`,
    )
  }
  return cookie.join('; ')
}

function expiredPayloadAuthCookie(req: PayloadRequest): string {
  const auth = req.payload.collections.users.config.auth
  if (!auth) throw new Error('Users authentication is not configured')

  const cookie = [
    `${req.payload.config.cookiePrefix}-token=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ]
  if (auth.cookies.domain) cookie.push(`Domain=${auth.cookies.domain}`)
  if (auth.cookies.secure || auth.cookies.sameSite === 'None') cookie.push('Secure')
  if (auth.cookies.sameSite) {
    cookie.push(
      `SameSite=${typeof auth.cookies.sameSite === 'string' ? auth.cookies.sameSite : 'Strict'}`,
    )
  }
  return cookie.join('; ')
}

function authenticatedUser(req: PayloadRequest) {
  if (!req.user || req.user.collection !== 'users') {
    throw new TwoFactorEndpointError('UNAUTHENTICATED', 'Sign in is required.', 401)
  }
  return req.user
}

async function writeTwoFactorAudit(
  req: PayloadRequest,
  action: 'account.two-factor.disable' | 'account.two-factor.enable',
): Promise<void> {
  const user = authenticatedUser(req)
  if (!req.payload.collections['audit-events']) return
  try {
    await writeAuditEvent(req, {
      action,
      outcome: 'succeeded',
      requestId: randomUUID(),
      target: `user:${String(user.id)}`,
    })
  } catch (error) {
    req.payload.logger.error({
      action,
      auditErrorType: error instanceof Error ? error.name : typeof error,
      msg: 'DBMason could not persist a two-factor security audit event.',
    })
  }
}

async function revokeAllSessions(req: PayloadRequest): Promise<void> {
  authenticatedUser(req)
  await logoutOperation({
    allSessions: true,
    collection: req.payload.collections.users,
    req,
  })
}

async function registerInvalidFactor(
  req: PayloadRequest,
  challenge: NonNullable<Awaited<ReturnType<typeof readTwoFactorChallenge>>>,
  user: Awaited<ReturnType<typeof readTwoFactorUser>>,
): Promise<never> {
  const challengeAttempts = await recordChallengeFailure(req, challenge.digest, challenge.record)
  const accountState = await registerTwoFactorFailure(req, user)
  const locked = accountState.locked || challengeAttempts >= maximumChallengeAttempts
  throw new TwoFactorEndpointError(
    locked ? 'TWO_FACTOR_LOCKED' : 'INVALID_FACTOR',
    locked
      ? 'Too many invalid codes. Try again in 10 minutes.'
      : 'The authenticator or recovery code is invalid.',
    locked ? 429 : 401,
    true,
  )
}

async function runInImmediateTransaction<T>(
  req: PayloadRequest,
  operation: () => Promise<T>,
): Promise<T> {
  const started = await initTransaction(req)
  try {
    const result = await operation()
    if (started) await commitTransaction(req)
    return result
  } catch (error) {
    if (started) {
      if (error instanceof TwoFactorEndpointError && error.persistChanges) {
        try {
          await commitTransaction(req)
        } catch (commitError) {
          await killTransaction(req)
          throw commitError
        }
      } else {
        await killTransaction(req)
      }
    }
    throw error
  }
}

async function handleBootstrap(req: PayloadRequest): Promise<Response> {
  assertSameOrigin(req)
  const input = await parseBody(req, bootstrapSchema)
  return serializeAuthentication(() => bootstrapOwner(req, input))
}

async function bootstrapOwner(
  req: PayloadRequest,
  input: z.infer<typeof bootstrapSchema>,
): Promise<Response> {
  if ((await req.payload.count({ collection: 'users', overrideAccess: true })).totalDocs !== 0) {
    throw new TwoFactorEndpointError(
      'BOOTSTRAP_COMPLETE',
      'The owner account has already been created.',
      409,
    )
  }

  await req.payload.create({
    collection: 'users',
    data: { email: input.email, name: input.name, password: input.password, roles: ['owner'] },
    overrideAccess: false,
    req,
  })
  return noStoreJson({ ok: true }, 201)
}

async function handleStart(req: PayloadRequest): Promise<Response> {
  assertSameOrigin(req)
  const input = await parseBody(req, startSchema)
  return serializeAuthentication(() => startTwoFactorLogin(req, input))
}

async function startTwoFactorLogin(
  req: PayloadRequest,
  input: z.infer<typeof startSchema>,
): Promise<Response> {
  const passwordSession = await createPrivatePasswordSession(req, input.email, input.password)
  let keepPasswordSession = false
  try {
    const user = await readTwoFactorUser(req, passwordSession.user.id)
    if (!user.twoFactorEnabled) {
      const response = noStoreJson({ authenticated: true, mode: 'password', ok: true }, 200, {
        'Set-Cookie': payloadAuthCookie(req, passwordSession.token),
      })
      keepPasswordSession = true
      return response
    }
    if (isTwoFactorLocked(user)) {
      throw new TwoFactorEndpointError(
        'TWO_FACTOR_LOCKED',
        'Too many invalid codes. Try again in 10 minutes.',
        429,
      )
    }
    if (!user.twoFactorSecret) throw new Error('Enabled two-factor account has no encrypted secret')
    const challenge = await createTwoFactorChallenge(req, {
      mode: 'verify',
      userId: user.id,
    })
    return noStoreJson({ challenge: challenge.token, mode: 'verify', ok: true })
  } finally {
    if (!keepPasswordSession) await revokeTransientSession(req, passwordSession.token)
  }
}

async function handleComplete(req: PayloadRequest): Promise<Response> {
  assertSameOrigin(req)
  const input = await parseBody(req, completeSchema)
  return serializeAuthentication(() => completeWithPrivateSession(req, input))
}

async function completeWithPrivateSession(
  req: PayloadRequest,
  input: z.infer<typeof completeSchema>,
): Promise<Response> {
  const passwordSession = await createPrivatePasswordSession(req, input.email, input.password)
  try {
    return await runInImmediateTransaction(req, () =>
      completeTwoFactorLogin(req, input, passwordSession),
    )
  } catch (error) {
    await revokeTransientSession(req, passwordSession.token)
    throw error
  }
}

async function completeTwoFactorLogin(
  req: PayloadRequest,
  input: z.infer<typeof completeSchema>,
  passwordSession: Awaited<ReturnType<typeof createPrivatePasswordSession>>,
): Promise<Response> {
  const challenge = await readTwoFactorChallenge(req, input.challenge)
  if (!challenge) {
    throw new TwoFactorEndpointError(
      'CHALLENGE_EXPIRED',
      'The sign-in challenge expired. Start again.',
      401,
      true,
    )
  }

  const user = await readTwoFactorUser(req, challenge.record.userId)
  if (String(passwordSession.user.id) !== String(user.id)) {
    throw new TwoFactorEndpointError('INVALID_CREDENTIALS', invalidCredentialsMessage, 401)
  }
  if (isTwoFactorLocked(user)) {
    throw new TwoFactorEndpointError(
      'TWO_FACTOR_LOCKED',
      'Too many invalid codes. Try again in 10 minutes.',
      429,
    )
  }

  if (challenge.record.mode !== 'verify') {
    throw new TwoFactorEndpointError(
      'CHALLENGE_EXPIRED',
      'The sign-in challenge is no longer valid.',
      401,
    )
  }
  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new TwoFactorEndpointError(
      'CHALLENGE_EXPIRED',
      'The sign-in challenge is no longer valid.',
      401,
    )
  }

  let factorMutation: FactorMutation
  const secret = decryptTotpSecret(`user:${String(user.id)}`, user.twoFactorSecret)
  const counter = verifyTotpCode(secret, input.code, {
    ...(user.twoFactorLastCounter === null || user.twoFactorLastCounter === undefined
      ? {}
      : { minimumCounterExclusive: user.twoFactorLastCounter }),
  })
  if (counter !== null) {
    factorMutation = { counter, method: 'totp' }
  } else {
    const usedHash = findRecoveryCodeHash(input.code, user.twoFactorRecoveryCodeHashes)
    if (!usedHash) return registerInvalidFactor(req, challenge, user)
    factorMutation = {
      method: 'recovery',
      remainingRecoveryCodeHashes: user.twoFactorRecoveryCodeHashes.filter(
        (hash) => hash !== usedHash,
      ),
    }
  }

  await consumeTwoFactorChallenge(req, challenge.digest, user.id)
  await applyTwoFactorMutation(req, user.id, factorMutation)

  return noStoreJson({ exp: passwordSession.exp, ok: true }, 200, {
    'Set-Cookie': payloadAuthCookie(req, passwordSession.token),
  })
}

async function reauthenticateCurrentUser(
  req: PayloadRequest,
  password: string,
): Promise<Awaited<ReturnType<typeof readTwoFactorUser>>> {
  const signedIn = authenticatedUser(req)
  const user = await readTwoFactorUser(req, signedIn.id)
  const passwordUser = await verifyPassword(req, user.email, password)
  if (String(passwordUser.id) !== String(user.id)) {
    throw new TwoFactorEndpointError('INVALID_CREDENTIALS', invalidCredentialsMessage, 401)
  }
  return user
}

async function handleSettings(req: PayloadRequest): Promise<Response> {
  const user = authenticatedUser(req)
  const state = await readTwoFactorUser(req, user.id)
  return noStoreJson({ enabled: state.twoFactorEnabled, ok: true })
}

async function handleEnrollmentStart(req: PayloadRequest): Promise<Response> {
  assertSameOrigin(req)
  const input = await parseBody(req, passwordSchema)
  return serializeAuthentication(async () => {
    const user = await reauthenticateCurrentUser(req, input.password)
    if (user.twoFactorEnabled) {
      throw new TwoFactorEndpointError(
        'TWO_FACTOR_ALREADY_ENABLED',
        'Two-factor authentication is already enabled.',
        409,
      )
    }
    if (isTwoFactorLocked(user)) {
      throw new TwoFactorEndpointError(
        'TWO_FACTOR_LOCKED',
        'Too many invalid codes. Try again in 10 minutes.',
        429,
      )
    }

    const secret = generateTotpSecret()
    const challenge = await createTwoFactorChallenge(req, {
      mode: 'enroll',
      pendingSecret: secret,
      userId: user.id,
    })
    const uri = buildTotpUri(user.email, secret)
    const qrCodeDataUrl = await QRCode.toDataURL(uri, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 240,
    })
    return noStoreJson({
      challenge: challenge.token,
      manualKey: secret.match(/.{1,4}/gu)?.join(' ') ?? secret,
      mode: 'enroll',
      ok: true,
      qrCodeDataUrl,
    })
  })
}

async function handleEnrollmentComplete(req: PayloadRequest): Promise<Response> {
  assertSameOrigin(req)
  const input = await parseBody(req, enrollmentCompleteSchema)
  return serializeAuthentication(async () => {
    const signedIn = authenticatedUser(req)
    const recoveryCodes = await runInImmediateTransaction(req, async () => {
      const challenge = await readTwoFactorChallenge(req, input.challenge)
      if (
        !challenge ||
        challenge.record.mode !== 'enroll' ||
        String(challenge.record.userId) !== String(signedIn.id) ||
        !challenge.pendingSecret
      ) {
        throw new TwoFactorEndpointError(
          'CHALLENGE_EXPIRED',
          'The enrollment challenge expired. Start again.',
          401,
          true,
        )
      }

      const user = await readTwoFactorUser(req, signedIn.id)
      if (user.twoFactorEnabled) {
        throw new TwoFactorEndpointError(
          'TWO_FACTOR_ALREADY_ENABLED',
          'Two-factor authentication is already enabled.',
          409,
        )
      }
      if (isTwoFactorLocked(user)) {
        throw new TwoFactorEndpointError(
          'TWO_FACTOR_LOCKED',
          'Too many invalid codes. Try again in 10 minutes.',
          429,
        )
      }

      const counter = verifyTotpCode(challenge.pendingSecret, input.code)
      if (counter === null) return registerInvalidFactor(req, challenge, user)
      const codes = generateRecoveryCodes()
      await consumeTwoFactorChallenge(req, challenge.digest, user.id)
      await applyTwoFactorMutation(req, user.id, {
        encryptedSecret: encryptTotpSecret(`user:${String(user.id)}`, challenge.pendingSecret),
        lastCounter: counter,
        method: 'enrollment',
        recoveryCodeHashes: codes.map(hashRecoveryCode),
      })
      await revokeAllSessions(req)
      return codes
    })

    await writeTwoFactorAudit(req, 'account.two-factor.enable')
    return noStoreJson({ ok: true, recoveryCodes }, 200, {
      'Set-Cookie': expiredPayloadAuthCookie(req),
    })
  })
}

async function handleDisable(req: PayloadRequest): Promise<Response> {
  assertSameOrigin(req)
  const input = await parseBody(req, disableSchema)
  return serializeAuthentication(async () => {
    await reauthenticateCurrentUser(req, input.password)
    await runInImmediateTransaction(req, async () => {
      const signedIn = authenticatedUser(req)
      const user = await readTwoFactorUser(req, signedIn.id)
      if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        throw new TwoFactorEndpointError(
          'TWO_FACTOR_NOT_ENABLED',
          'Two-factor authentication is already disabled.',
          409,
        )
      }
      if (isTwoFactorLocked(user)) {
        throw new TwoFactorEndpointError(
          'TWO_FACTOR_LOCKED',
          'Too many invalid codes. Try again in 10 minutes.',
          429,
        )
      }

      const secret = decryptTotpSecret(`user:${String(user.id)}`, user.twoFactorSecret)
      const counter = verifyTotpCode(secret, input.code, {
        ...(user.twoFactorLastCounter === null || user.twoFactorLastCounter === undefined
          ? {}
          : { minimumCounterExclusive: user.twoFactorLastCounter }),
      })
      const recoveryHash =
        counter === null ? findRecoveryCodeHash(input.code, user.twoFactorRecoveryCodeHashes) : null
      if (counter === null && !recoveryHash) {
        const accountState = await registerTwoFactorFailure(req, user)
        throw new TwoFactorEndpointError(
          accountState.locked ? 'TWO_FACTOR_LOCKED' : 'INVALID_FACTOR',
          accountState.locked
            ? 'Too many invalid codes. Try again in 10 minutes.'
            : 'The authenticator or recovery code is invalid.',
          accountState.locked ? 429 : 401,
          true,
        )
      }

      await clearTwoFactorChallenge(req, user.id)
      await req.payload.update({
        collection: 'users',
        data: {
          twoFactorEnabled: false,
          twoFactorFailedAttempts: 0,
          twoFactorLastCounter: null,
          twoFactorLockedUntil: null,
          twoFactorRecoveryCodeHashes: [],
          twoFactorSecret: null,
        },
        id: user.id,
        overrideAccess: true,
        req,
      })
      await revokeAllSessions(req)
    })

    await writeTwoFactorAudit(req, 'account.two-factor.disable')
    return noStoreJson({ ok: true }, 200, { 'Set-Cookie': expiredPayloadAuthCookie(req) })
  })
}

function guarded(handler: (req: PayloadRequest) => Promise<Response>) {
  return async (req: PayloadRequest): Promise<Response> => {
    try {
      return await handler(req)
    } catch (error) {
      if (error instanceof TwoFactorEndpointError) {
        return noStoreJson({ error: { code: error.code, message: error.message } }, error.status)
      }
      if (error instanceof z.ZodError) {
        return noStoreJson(
          {
            error: {
              code: 'INVALID_INPUT',
              message: error.issues[0]?.message ?? 'Enter valid values.',
            },
          },
          400,
        )
      }
      req.payload.logger.error({ err: error, msg: 'Two-factor authentication request failed' })
      return noStoreJson(
        {
          error: {
            code: 'AUTHENTICATION_FAILED',
            message: 'The authentication request failed safely.',
          },
        },
        500,
      )
    }
  }
}

export const twoFactorEndpoints: Endpoint[] = [
  { handler: guarded(handleBootstrap), method: 'post', path: '/two-factor/bootstrap' },
  { handler: guarded(handleStart), method: 'post', path: '/two-factor/start' },
  { handler: guarded(handleComplete), method: 'post', path: '/two-factor/complete' },
  { handler: guarded(handleSettings), method: 'get', path: '/two-factor/settings' },
  {
    handler: guarded(handleEnrollmentStart),
    method: 'post',
    path: '/two-factor/settings/enrollment',
  },
  {
    handler: guarded(handleEnrollmentComplete),
    method: 'post',
    path: '/two-factor/settings/enrollment/complete',
  },
  { handler: guarded(handleDisable), method: 'post', path: '/two-factor/settings/disable' },
]
