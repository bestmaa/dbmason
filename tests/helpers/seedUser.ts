import { getPayload } from 'payload'
import config from '../../src/payload.config.js'

export const testUser: {
  email: string
  name: string
  password: string
  roles: Array<'owner'>
} = {
  email: 'owner@dbmason.test',
  name: 'DBMason Test Owner',
  password: 'Payload_Test_Only_2026!',
  roles: ['owner'],
}

/**
 * Seeds a test user for e2e admin tests.
 */
export async function seedTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  const existing = await payload.find({
    collection: 'users',
    limit: 1,
    where: {
      email: {
        equals: testUser.email,
      },
    },
  })

  const existingUser = existing.docs[0]
  const resetTwoFactor = {
    twoFactorEnabled: false,
    twoFactorFailedAttempts: 0,
    twoFactorLastCounter: null,
    twoFactorLockedUntil: null,
    twoFactorRecoveryCodeHashes: [],
    twoFactorSecret: null,
  }
  if (existingUser) {
    await payload.update({
      collection: 'users',
      data: { ...testUser, ...resetTwoFactor },
      id: existingUser.id,
    })
    return
  }

  await payload.create({
    collection: 'users',
    data: { ...testUser, ...resetTwoFactor },
  })
}

/**
 * Cleans up test user after tests
 */
export async function cleanupTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  const [matchingUsers, owners] = await Promise.all([
    payload.find({
      collection: 'users',
      limit: 1,
      where: { email: { equals: testUser.email } },
    }),
    payload.count({
      collection: 'users',
      where: { roles: { contains: 'owner' } },
    }),
  ])

  const existingUser = matchingUsers.docs[0]
  if (!existingUser || (existingUser.roles?.includes('owner') && owners.totalDocs <= 1)) return

  await payload.delete({
    collection: 'users',
    id: existingUser.id,
  })
}
