import type { PayloadRequest } from 'payload'
import { z } from 'zod'

const twoFactorUserSchema = z.object({
  email: z.string().email(),
  id: z.union([z.number().int(), z.string().min(1)]),
  twoFactorEnabled: z.boolean().optional().default(false),
  twoFactorFailedAttempts: z.number().int().min(0).optional().default(0),
  twoFactorLastCounter: z.number().int().min(0).nullish(),
  twoFactorLockedUntil: z.string().nullish(),
  twoFactorRecoveryCodeHashes: z.array(z.string()).optional().default([]),
  twoFactorSecret: z.string().nullish(),
})

export type TwoFactorUser = z.infer<typeof twoFactorUserSchema>

export async function readTwoFactorUser(
  req: PayloadRequest,
  id: number | string,
): Promise<TwoFactorUser> {
  const user = await req.payload.findByID({
    collection: 'users',
    depth: 0,
    id,
    overrideAccess: true,
    req,
    showHiddenFields: true,
  })
  return twoFactorUserSchema.parse(user)
}

export function isTwoFactorLocked(user: TwoFactorUser, now = Date.now()): boolean {
  if (!user.twoFactorLockedUntil) return false
  const lockedUntil = Date.parse(user.twoFactorLockedUntil)
  return Number.isFinite(lockedUntil) && lockedUntil > now
}

export async function registerTwoFactorFailure(
  req: PayloadRequest,
  user: TwoFactorUser,
): Promise<{ locked: boolean }> {
  const previousLock = user.twoFactorLockedUntil
    ? Date.parse(user.twoFactorLockedUntil)
    : Number.NaN
  const previousLockExpired = Number.isFinite(previousLock) && previousLock <= Date.now()
  const failedAttempts = (previousLockExpired ? 0 : user.twoFactorFailedAttempts) + 1
  const locked = failedAttempts >= 5
  await req.payload.update({
    collection: 'users',
    data: {
      twoFactorFailedAttempts: failedAttempts,
      twoFactorLockedUntil: locked ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null,
    },
    id: user.id,
    overrideAccess: true,
    req,
  })
  return { locked }
}
