import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Payload } from 'payload'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { User } from '@/payload-types'

type Harness = {
  config: Payload['config']
  databaseURL: string
  directory: string
  payload: Payload
}

type SettingsMutationEndpoint =
  'settings/disable' | 'settings/enrollment' | 'settings/enrollment/complete'

const origin = 'http://localhost:3010'
const email = 'concurrency-owner@example.test'
const password = 'Testing!123456'
const environment = {
  CONNECTION_ENCRYPTION_KEY: 'd'.repeat(64),
  DBMASON_PUBLIC_URL: origin,
  NODE_ENV: 'test',
  PAYLOAD_SECRET: 'two-factor-concurrency-secret-at-least-32-characters',
} as const
const originalEnvironment = new Map(
  [...Object.keys(environment), 'DATABASE_URL'].map((key) => [key, process.env[key]]),
)

function restoreEnvironment(): void {
  for (const [key, value] of originalEnvironment) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

async function createHarness(sourceDatabasePath?: string): Promise<Harness> {
  const directory = await mkdtemp(path.join(tmpdir(), 'dbmason-2fa-concurrency-'))
  const databasePath = path.join(directory, 'control.db')
  if (sourceDatabasePath) await copyFile(sourceDatabasePath, databasePath)
  const databaseURL = `file:${databasePath}`
  process.env.DATABASE_URL = databaseURL
  const [
    { sqliteAdapter },
    { buildConfig, getPayload },
    { AuditEvents },
    { DatabaseConnections },
    { createUsersCollection },
  ] = await Promise.all([
    import('@payloadcms/db-sqlite'),
    import('payload'),
    import('@/collections/AuditEvents'),
    import('@/collections/DatabaseConnections'),
    import('@/collections/Users'),
  ])
  const config = await buildConfig({
    collections: [
      createUsersCollection({ secureCookies: false }),
      DatabaseConnections,
      AuditEvents,
    ],
    cors: [origin],
    db: sqliteAdapter({
      busyTimeout: 5_000,
      client: { url: databaseURL },
      push: true,
      transactionOptions: { behavior: 'immediate' },
    }),
    logger: { options: { level: 'fatal' } },
    secret: environment.PAYLOAD_SECRET,
    serverURL: origin,
  })
  const payload = await getPayload({ config, key: databaseURL })
  return { config: payload.config, databaseURL, directory, payload }
}

async function destroyHarness(harness: Harness): Promise<void> {
  await harness.payload.destroy()
  await rm(harness.directory, { force: true, recursive: true })
}

async function post(
  harness: Harness,
  endpoint:
    | 'bootstrap'
    | 'complete'
    | 'settings/disable'
    | 'settings/enrollment'
    | 'settings/enrollment/complete'
    | 'start',
  body: Record<string, unknown>,
  cookie?: string,
  requestOrigin: string | null = origin,
): Promise<Response> {
  const { handleEndpoints } = await import('payload')
  return handleEndpoints({
    config: harness.config,
    payloadInstanceCacheKey: harness.databaseURL,
    request: new Request(`${origin}/api/users/two-factor/${endpoint}`, {
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(requestOrigin === null ? {} : { Origin: requestOrigin }),
      },
      method: 'POST',
    }),
  })
}

async function getSettings(harness: Harness, cookie?: string): Promise<Response> {
  const { handleEndpoints } = await import('payload')
  return handleEndpoints({
    config: harness.config,
    payloadInstanceCacheKey: harness.databaseURL,
    request: new Request(`${origin}/api/users/two-factor/settings`, {
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        Origin: origin,
      },
      method: 'GET',
    }),
  })
}

function responseCookie(response: Response): string {
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0]
  if (!cookie) throw new Error('Expected an authentication cookie.')
  return cookie
}

async function responseObject(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json()
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Expected an object response.')
  }
  return body as Record<string, unknown>
}

function stringField(body: Record<string, unknown>, field: string): string {
  const value = body[field]
  if (typeof value !== 'string') throw new Error(`Expected response field ${field}.`)
  return value
}

function stringArrayField(body: Record<string, unknown>, field: string): string[] {
  const value = body[field]
  if (!Array.isArray(value)) throw new Error(`Expected string-array response field ${field}.`)
  const strings = value.filter((item): item is string => typeof item === 'string')
  if (strings.length !== value.length)
    throw new Error(`Expected string-array response field ${field}.`)
  return strings
}

function errorCode(body: Record<string, unknown>): string | undefined {
  const error = body.error
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function recoveryHashes(user: User): string[] {
  const hashes = user.twoFactorRecoveryCodeHashes
  if (!Array.isArray(hashes)) throw new Error('Expected stored recovery-code hashes.')
  const strings = hashes.filter((hash): hash is string => typeof hash === 'string')
  if (strings.length !== hashes.length) throw new Error('Expected stored recovery-code hashes.')
  return strings
}

function sessionCount(user: User): number {
  return user.sessions?.length ?? 0
}

function factorState(user: User) {
  return {
    enabled: user.twoFactorEnabled,
    failedAttempts: user.twoFactorFailedAttempts,
    lastCounter: user.twoFactorLastCounter,
    lockedUntil: user.twoFactorLockedUntil,
    recoveryCodeHashes: recoveryHashes(user),
    secret: user.twoFactorSecret,
  }
}

async function readUser(payload: Payload): Promise<User> {
  const result = await payload.find({
    collection: 'users',
    limit: 1,
    overrideAccess: true,
    showHiddenFields: true,
  })
  const user = result.docs[0]
  if (!user) throw new Error('Expected an enrolled user.')
  return user
}

async function bootstrapAndLogin(harness: Harness): Promise<string> {
  const bootstrap = await post(harness, 'bootstrap', {
    confirmPassword: password,
    email,
    name: 'Concurrency Owner',
    password,
  })
  expect(bootstrap.status).toBe(201)

  const login = await post(harness, 'start', { email, password })
  expect(login.status).toBe(200)
  return responseCookie(login)
}

async function startChallenge(harness: Harness): Promise<string> {
  const response = await post(harness, 'start', { email, password })
  expect(response.status).toBe(200)
  return stringField(await responseObject(response), 'challenge')
}

async function enroll(harness: Harness): Promise<string[]> {
  const bootstrap = await post(harness, 'bootstrap', {
    confirmPassword: password,
    email,
    name: 'Concurrency Owner',
    password,
  })
  expect(bootstrap.status).toBe(201)

  const login = await post(harness, 'start', { email, password })
  expect(login.status).toBe(200)
  const cookie = responseCookie(login)
  expect(await responseObject(login)).toMatchObject({ authenticated: true, mode: 'password' })

  const enrollment = await post(harness, 'settings/enrollment', { password }, cookie)
  expect(enrollment.status).toBe(200)
  const enrollmentBody = await responseObject(enrollment)
  const challenge = stringField(enrollmentBody, 'challenge')
  const secret = stringField(enrollmentBody, 'manualKey').replaceAll(/\s/gu, '')
  const { generateTotpCode } = await import('@/auth/two-factor/totp')
  const complete = await post(
    harness,
    'settings/enrollment/complete',
    {
      challenge,
      code: generateTotpCode(secret),
    },
    cookie,
  )
  expect(complete.status).toBe(200)
  return stringArrayField(await responseObject(complete), 'recoveryCodes')
}

describe.sequential('two-factor endpoint concurrency with SQLite', () => {
  let harness: Harness
  let templateDatabasePath: string
  let templateDirectory: string

  beforeAll(async () => {
    Object.assign(process.env, environment)
    const template = await createHarness()
    templateDatabasePath = path.join(template.directory, 'control.db')
    templateDirectory = template.directory
    await template.payload.destroy()
  })

  beforeEach(async () => {
    harness = await createHarness(templateDatabasePath)
  })

  afterEach(async () => {
    await destroyHarness(harness)
  })

  afterAll(async () => {
    await rm(templateDirectory, { force: true, recursive: true })
    restoreEnvironment()
  })

  it('keeps 2FA optional and creates no factor secret during password-only login', async () => {
    const bootstrap = await post(harness, 'bootstrap', {
      confirmPassword: password,
      email,
      name: 'Concurrency Owner',
      password,
    })
    expect(bootstrap.status).toBe(201)

    const login = await post(harness, 'start', { email, password })
    expect(login.status).toBe(200)
    expect(responseCookie(login)).toContain('payload-token=')
    expect(await responseObject(login)).toMatchObject({
      authenticated: true,
      mode: 'password',
    })

    const user = await readUser(harness.payload)
    expect(user.twoFactorEnabled).toBe(false)
    expect(user.twoFactorSecret).toBeNull()
    expect(recoveryHashes(user)).toEqual([])
    expect(sessionCount(user)).toBe(1)
  })

  it('rejects every settings mutation without authentication or an exact Origin', async () => {
    const cookie = await bootstrapAndLogin(harness)
    const cases: Array<{
      body: Record<string, unknown>
      endpoint: SettingsMutationEndpoint
    }> = [
      { body: { password }, endpoint: 'settings/enrollment' },
      {
        body: { challenge: 'A'.repeat(43), code: '000000' },
        endpoint: 'settings/enrollment/complete',
      },
      { body: { code: '000000', password }, endpoint: 'settings/disable' },
    ]
    const before = factorState(await readUser(harness.payload))

    for (const testCase of cases) {
      const unauthenticated = await post(harness, testCase.endpoint, testCase.body)
      expect(unauthenticated.status).toBe(401)
      expect(errorCode(await responseObject(unauthenticated))).toBe('UNAUTHENTICATED')

      const foreignOrigin = await post(
        harness,
        testCase.endpoint,
        testCase.body,
        cookie,
        'https://attacker.example',
      )
      expect(foreignOrigin.status).toBe(403)
      expect(errorCode(await responseObject(foreignOrigin))).toBe('ORIGIN_REJECTED')

      const missingOrigin = await post(harness, testCase.endpoint, testCase.body, cookie, null)
      expect(missingOrigin.status).toBe(403)
      expect(errorCode(await responseObject(missingOrigin))).toBe('ORIGIN_REJECTED')
    }

    expect(factorState(await readUser(harness.payload))).toEqual(before)
  })

  it('leaves factor state unchanged when enrollment reauthentication uses a wrong password', async () => {
    const cookie = await bootstrapAndLogin(harness)
    const before = factorState(await readUser(harness.payload))

    const response = await post(
      harness,
      'settings/enrollment',
      { password: 'WrongPassword!123456' },
      cookie,
    )

    expect(response.status).toBe(401)
    expect(errorCode(await responseObject(response))).toBe('INVALID_CREDENTIALS')
    expect(factorState(await readUser(harness.payload))).toEqual(before)
  })

  it('expires the prior cookie and revokes its session when enabling 2FA', async () => {
    const cookie = await bootstrapAndLogin(harness)
    expect(sessionCount(await readUser(harness.payload))).toBe(1)

    const enrollment = await post(harness, 'settings/enrollment', { password }, cookie)
    expect(enrollment.status).toBe(200)
    const enrollmentBody = await responseObject(enrollment)
    const challenge = stringField(enrollmentBody, 'challenge')
    const secret = stringField(enrollmentBody, 'manualKey').replaceAll(/\s/gu, '')
    const { generateTotpCode } = await import('@/auth/two-factor/totp')

    const completed = await post(
      harness,
      'settings/enrollment/complete',
      { challenge, code: generateTotpCode(secret) },
      cookie,
    )

    expect(completed.status).toBe(200)
    expect(completed.headers.get('set-cookie')).toContain('Max-Age=0')
    const user = await readUser(harness.payload)
    expect(user.twoFactorEnabled).toBe(true)
    expect(sessionCount(user)).toBe(0)

    const priorSession = await getSettings(harness, cookie)
    expect(priorSession.status).toBe(401)
    expect(errorCode(await responseObject(priorSession))).toBe('UNAUTHENTICATED')
  })

  it('persists lockout after parallel invalid factor completions', async () => {
    await enroll(harness)
    const challenge = await startChallenge(harness)
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        post(harness, 'complete', {
          challenge,
          code: '000000',
          email,
          password,
        }),
      ),
    )
    expect(responses.map(({ status }) => status).sort()).toEqual([401, 401, 401, 401, 429])
    const lockedUser = await readUser(harness.payload)
    expect(lockedUser.twoFactorFailedAttempts).toBe(5)
    expect(Date.parse(lockedUser.twoFactorLockedUntil ?? '')).toBeGreaterThan(Date.now())
    const replacement = await post(harness, 'start', { email, password })
    expect(replacement.status).toBe(429)
    expect(errorCode(await responseObject(replacement))).toBe('TWO_FACTOR_LOCKED')
  }, 20_000)

  it('allows exactly one parallel use of a recovery code', async () => {
    const recoveryCodes = await enroll(harness)
    const challenge = await startChallenge(harness)
    const before = await readUser(harness.payload)
    const usedCode = recoveryCodes[0]
    if (!usedCode) throw new Error('Enrollment returned no recovery code.')
    const { hashRecoveryCode } = await import('@/auth/two-factor/vault')
    const usedHash = hashRecoveryCode(usedCode)
    expect(recoveryHashes(before)).toContain(usedHash)

    const responses = await Promise.all(
      Array.from({ length: 2 }, () =>
        post(harness, 'complete', { challenge, code: usedCode, email, password }),
      ),
    )
    expect(responses.filter(({ status }) => status === 200)).toHaveLength(1)
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 401])
    expect(responses.find(({ status }) => status === 200)?.headers.get('set-cookie')).toBeTruthy()

    const after = await readUser(harness.payload)
    expect(recoveryHashes(after)).toHaveLength(recoveryHashes(before).length - 1)
    expect(recoveryHashes(after)).not.toContain(usedHash)
    expect(sessionCount(after)).toBe(sessionCount(before) + 1)
  }, 20_000)

  it('requires both password and a valid factor to disable, then clears factor state and sessions', async () => {
    const codes = await enroll(harness)
    const challenge = await startChallenge(harness)
    const login = await post(harness, 'complete', {
      challenge,
      code: codes[0],
      email,
      password,
    })
    expect(login.status).toBe(200)
    const cookie = responseCookie(login)

    const rejected = await post(harness, 'settings/disable', { code: '000000', password }, cookie)
    expect(rejected.status).toBe(401)
    expect((await readUser(harness.payload)).twoFactorEnabled).toBe(true)

    const disabled = await post(harness, 'settings/disable', { code: codes[1], password }, cookie)
    expect(disabled.status).toBe(200)
    expect(disabled.headers.get('set-cookie')).toContain('Max-Age=0')

    const user = await readUser(harness.payload)
    expect(user.twoFactorEnabled).toBe(false)
    expect(user.twoFactorSecret).toBeNull()
    expect(user.twoFactorLastCounter).toBeNull()
    expect(user.twoFactorLockedUntil).toBeNull()
    expect(recoveryHashes(user)).toEqual([])
    expect(sessionCount(user)).toBe(0)

    const passwordOnly = await post(harness, 'start', { email, password })
    expect(await responseObject(passwordOnly)).toMatchObject({
      authenticated: true,
      mode: 'password',
    })
  }, 20_000)

  it('does not consume factor state when disable reauthentication uses a wrong password', async () => {
    const codes = await enroll(harness)
    const challenge = await startChallenge(harness)
    const loginCode = codes[0]
    const disableCode = codes[1]
    if (!loginCode || !disableCode) throw new Error('Enrollment returned too few recovery codes.')
    const login = await post(harness, 'complete', {
      challenge,
      code: loginCode,
      email,
      password,
    })
    expect(login.status).toBe(200)
    const cookie = responseCookie(login)
    const before = factorState(await readUser(harness.payload))

    const rejected = await post(
      harness,
      'settings/disable',
      { code: disableCode, password: 'WrongPassword!123456' },
      cookie,
    )

    expect(rejected.status).toBe(401)
    expect(errorCode(await responseObject(rejected))).toBe('INVALID_CREDENTIALS')
    expect(factorState(await readUser(harness.payload))).toEqual(before)
  }, 20_000)

  it('writes only secret-free metadata to the 2FA audit trail', async () => {
    const cookie = await bootstrapAndLogin(harness)
    const enrollment = await post(harness, 'settings/enrollment', { password }, cookie)
    const enrollmentBody = await responseObject(enrollment)
    const challenge = stringField(enrollmentBody, 'challenge')
    const manualKey = stringField(enrollmentBody, 'manualKey').replaceAll(/\s/gu, '')
    const { generateTotpCode } = await import('@/auth/two-factor/totp')
    const completed = await post(
      harness,
      'settings/enrollment/complete',
      { challenge, code: generateTotpCode(manualKey) },
      cookie,
    )
    expect(completed.status).toBe(200)
    const recoveryCodes = stringArrayField(await responseObject(completed), 'recoveryCodes')
    const loginCode = recoveryCodes[0]
    const disableCode = recoveryCodes[1]
    if (!loginCode || !disableCode) throw new Error('Enrollment returned too few recovery codes.')

    const loginChallenge = await startChallenge(harness)
    const login = await post(harness, 'complete', {
      challenge: loginChallenge,
      code: loginCode,
      email,
      password,
    })
    expect(login.status).toBe(200)
    const disabled = await post(
      harness,
      'settings/disable',
      { code: disableCode, password },
      responseCookie(login),
    )
    expect(disabled.status).toBe(200)

    const audits = await harness.payload.find({
      collection: 'audit-events',
      depth: 0,
      overrideAccess: true,
      sort: 'createdAt',
    })
    expect(audits.docs).toHaveLength(2)
    expect(audits.docs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'account.two-factor.enable',
          outcome: 'succeeded',
        }),
        expect.objectContaining({
          action: 'account.two-factor.disable',
          outcome: 'succeeded',
        }),
      ]),
    )

    const serializedAudit = JSON.stringify(audits.docs)
    expect(serializedAudit).not.toContain(password)
    expect(serializedAudit).not.toContain(challenge)
    expect(serializedAudit).not.toContain(manualKey)
    for (const recoveryCode of recoveryCodes) {
      expect(serializedAudit).not.toContain(recoveryCode)
    }
  })
})
