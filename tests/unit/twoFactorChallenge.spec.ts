import type { Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  consumeTwoFactorChallenge,
  createTwoFactorChallenge,
  readTwoFactorChallenge,
  recordChallengeFailure,
} from '@/auth/two-factor/challengeStore'

beforeAll(() => {
  process.env.CONNECTION_ENCRYPTION_KEY = 'c'.repeat(64)
  process.env.DATABASE_URL = 'file:./two-factor-challenge-test.db'
  process.env.DBMASON_PUBLIC_URL = 'http://localhost:3010'
  process.env.PAYLOAD_SECRET = 'two-factor-challenge-test-secret-at-least-32-characters'
})

class MemoryKv {
  readonly values = new Map<string, unknown>()

  async delete(key: string): Promise<void> {
    this.values.delete(key)
  }

  async get<T>(key: string): Promise<null | T> {
    return (this.values.get(key) as T | undefined) ?? null
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, value)
  }
}

function testPayload(): Payload {
  return { kv: new MemoryKv() } as unknown as Payload
}

describe('two-factor challenges', () => {
  it('stores no raw token or pending TOTP secret', async () => {
    const payload = testPayload()
    const secret = 'JBSWY3DPEHPK3PXP'
    const { token } = await createTwoFactorChallenge(payload, {
      mode: 'enroll',
      pendingSecret: secret,
      userId: 7,
    })
    const serializedStore = JSON.stringify([...(payload.kv as unknown as MemoryKv).values])

    expect(serializedStore).not.toContain(token)
    expect(serializedStore).not.toContain(secret)
    expect((await readTwoFactorChallenge(payload, token))?.pendingSecret).toBe(secret)
  })

  it('invalidates a previous challenge for the same user', async () => {
    const payload = testPayload()
    const first = await createTwoFactorChallenge(payload, { mode: 'verify', userId: 9 })
    const second = await createTwoFactorChallenge(payload, { mode: 'verify', userId: 9 })

    expect(await readTwoFactorChallenge(payload, first.token)).toBeNull()
    expect(await readTwoFactorChallenge(payload, second.token)).not.toBeNull()
  })

  it('consumes a challenge and removes it after repeated failures', async () => {
    const payload = testPayload()
    const { token } = await createTwoFactorChallenge(payload, { mode: 'verify', userId: 11 })
    let challenge = await readTwoFactorChallenge(payload, token)
    if (!challenge) throw new Error('Expected a stored challenge')

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      if (!challenge) throw new Error('Challenge expired too early')
      await recordChallengeFailure(payload, challenge.digest, challenge.record)
      challenge = await readTwoFactorChallenge(payload, token)
      if (attempt < 5 && !challenge) throw new Error('Challenge expired too early')
    }
    expect(challenge).toBeNull()

    const replacement = await createTwoFactorChallenge(payload, { mode: 'verify', userId: 11 })
    const stored = await readTwoFactorChallenge(payload, replacement.token)
    if (!stored) throw new Error('Expected a replacement challenge')
    await consumeTwoFactorChallenge(payload, stored.digest, stored.record.userId)
    expect(await readTwoFactorChallenge(payload, replacement.token)).toBeNull()
  })
})
