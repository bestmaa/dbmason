import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { registerTwoFactorFailure, type TwoFactorUser } from '@/auth/two-factor/userState'

function testUser(overrides: Partial<TwoFactorUser> = {}): TwoFactorUser {
  return {
    email: 'owner@example.test',
    id: 1,
    twoFactorEnabled: true,
    twoFactorFailedAttempts: 0,
    twoFactorLastCounter: null,
    twoFactorLockedUntil: null,
    twoFactorRecoveryCodeHashes: [],
    twoFactorSecret: 'encrypted-secret',
    ...overrides,
  }
}

describe('two-factor account lockout', () => {
  it('locks the account after five consecutive invalid factors', async () => {
    const update = vi.fn().mockResolvedValue({})
    const req = { payload: { update } } as unknown as PayloadRequest

    await expect(
      registerTwoFactorFailure(req, testUser({ twoFactorFailedAttempts: 4 })),
    ).resolves.toEqual({ locked: true })

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          twoFactorFailedAttempts: 5,
          twoFactorLockedUntil: expect.any(String),
        }),
      }),
    )
  })

  it('starts a fresh attempt window after an expired lock', async () => {
    const update = vi.fn().mockResolvedValue({})
    const req = { payload: { update } } as unknown as PayloadRequest

    await expect(
      registerTwoFactorFailure(
        req,
        testUser({
          twoFactorFailedAttempts: 5,
          twoFactorLockedUntil: new Date(Date.now() - 1_000).toISOString(),
        }),
      ),
    ).resolves.toEqual({ locked: false })

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          twoFactorFailedAttempts: 1,
          twoFactorLockedUntil: null,
        },
      }),
    )
  })
})
