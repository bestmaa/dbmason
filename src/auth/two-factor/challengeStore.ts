import { createHash, randomBytes } from 'node:crypto'

import type { Payload, PayloadRequest } from 'payload'
import { z } from 'zod'

import { decryptTotpSecret, encryptTotpSecret } from './vault'

const challengeLifetimeMs = 5 * 60 * 1000
const maximumChallengeAttempts = 5
const challengeTokenPattern = /^[A-Za-z\d_-]{43}$/u

const storedChallengeSchema = z.object({
  attempts: z.number().int().min(0).max(maximumChallengeAttempts),
  expiresAt: z.number().int().positive(),
  mode: z.enum(['enroll', 'verify']),
  pendingSecret: z.string().optional(),
  userId: z.union([z.number().int(), z.string().min(1)]),
  version: z.literal(1),
})

export type StoredTwoFactorChallenge = z.infer<typeof storedChallengeSchema>
type ChallengeStoreContext = Payload | PayloadRequest
type ChallengeStoreValue = boolean | number | object | string

function isPayloadRequest(context: ChallengeStoreContext): context is PayloadRequest {
  return 'payload' in context
}

async function getValue<T extends ChallengeStoreValue>(
  context: ChallengeStoreContext,
  key: string,
): Promise<null | T> {
  if (!isPayloadRequest(context)) return context.kv.get<T>(key)

  const document = await context.payload.db.findOne<{
    data?: T
    id: number | string
  }>({
    collection: 'payload-kv',
    req: context,
    select: { data: true, key: true },
    where: { key: { equals: key } },
  })
  return document?.data ?? null
}

async function setValue(
  context: ChallengeStoreContext,
  key: string,
  data: ChallengeStoreValue,
): Promise<void> {
  if (!isPayloadRequest(context)) {
    await context.kv.set(key, data)
    return
  }

  await context.payload.db.upsert({
    collection: 'payload-kv',
    data: { data, key },
    req: context,
    select: {},
    where: { key: { equals: key } },
  })
}

async function deleteValue(context: ChallengeStoreContext, key: string): Promise<void> {
  if (!isPayloadRequest(context)) {
    await context.kv.delete(key)
    return
  }

  await context.payload.db.deleteMany({
    collection: 'payload-kv',
    req: context,
    where: { key: { equals: key } },
  })
}

function digestToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url')
}

function challengeKey(digest: string): string {
  return `dbmason:two-factor:challenge:${digest}`
}

function userChallengeKey(userId: number | string): string {
  return `dbmason:two-factor:user:${String(userId)}`
}

async function deletePreviousChallenge(
  context: ChallengeStoreContext,
  userId: number | string,
): Promise<void> {
  const pointerKey = userChallengeKey(userId)
  const previousDigest = await getValue<string>(context, pointerKey)
  if (previousDigest) await deleteValue(context, challengeKey(previousDigest))
  await deleteValue(context, pointerKey)
}

export async function clearTwoFactorChallenge(
  context: ChallengeStoreContext,
  userId: number | string,
): Promise<void> {
  await deletePreviousChallenge(context, userId)
}

export async function createTwoFactorChallenge(
  context: ChallengeStoreContext,
  input: {
    mode: 'enroll' | 'verify'
    pendingSecret?: string
    userId: number | string
  },
): Promise<{ token: string }> {
  await deletePreviousChallenge(context, input.userId)
  const token = randomBytes(32).toString('base64url')
  const digest = digestToken(token)
  const record: StoredTwoFactorChallenge = {
    attempts: 0,
    expiresAt: Date.now() + challengeLifetimeMs,
    mode: input.mode,
    ...(input.pendingSecret
      ? { pendingSecret: encryptTotpSecret(`pending:${digest}`, input.pendingSecret) }
      : {}),
    userId: input.userId,
    version: 1,
  }
  await setValue(context, challengeKey(digest), record)
  await setValue(context, userChallengeKey(input.userId), digest)
  return { token }
}

export async function readTwoFactorChallenge(
  context: ChallengeStoreContext,
  token: string,
): Promise<{ digest: string; pendingSecret?: string; record: StoredTwoFactorChallenge } | null> {
  if (!challengeTokenPattern.test(token)) return null
  const digest = digestToken(token)
  const parsed = storedChallengeSchema.safeParse(await getValue(context, challengeKey(digest)))
  if (!parsed.success) return null
  const pointer = await getValue<string>(context, userChallengeKey(parsed.data.userId))
  if (pointer !== digest || parsed.data.expiresAt <= Date.now()) {
    await consumeTwoFactorChallenge(context, digest, parsed.data.userId)
    return null
  }
  return {
    digest,
    ...(parsed.data.pendingSecret
      ? { pendingSecret: decryptTotpSecret(`pending:${digest}`, parsed.data.pendingSecret) }
      : {}),
    record: parsed.data,
  }
}

export async function recordChallengeFailure(
  context: ChallengeStoreContext,
  digest: string,
  record: StoredTwoFactorChallenge,
): Promise<number> {
  const attempts = Math.min(maximumChallengeAttempts, record.attempts + 1)
  if (attempts >= maximumChallengeAttempts) {
    await consumeTwoFactorChallenge(context, digest, record.userId)
  } else {
    await setValue(context, challengeKey(digest), { ...record, attempts })
  }
  return attempts
}

export async function consumeTwoFactorChallenge(
  context: ChallengeStoreContext,
  digest: string,
  userId: number | string,
): Promise<void> {
  await deleteValue(context, challengeKey(digest))
  const pointerKey = userChallengeKey(userId)
  if ((await getValue<string>(context, pointerKey)) === digest) {
    await deleteValue(context, pointerKey)
  }
}

export { maximumChallengeAttempts }
