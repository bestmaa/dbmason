import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Payload } from 'payload'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { User } from '@/payload-types'

type Harness = {
  databaseURL: string
  directory: string
  payload: Payload
}

const originalDatabaseURL = process.env.DATABASE_URL

function restoreDatabaseURL(): void {
  if (originalDatabaseURL === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = originalDatabaseURL
}

async function createHarness(sourceDatabasePath?: string): Promise<Harness> {
  const directory = await mkdtemp(path.join(tmpdir(), 'db-control-rbac-'))
  const databasePath = path.join(directory, 'control.db')
  if (sourceDatabasePath) await copyFile(sourceDatabasePath, databasePath)
  const databaseURL = `file:${databasePath}`
  process.env.DATABASE_URL = databaseURL
  const [{ sqliteAdapter }, { buildConfig, getPayload }, { Users }] = await Promise.all([
    import('@payloadcms/db-sqlite'),
    import('payload'),
    import('@/collections/Users'),
  ])
  const config = await buildConfig({
    collections: [Users],
    db: sqliteAdapter({
      busyTimeout: 5_000,
      client: { url: databaseURL },
      push: true,
      transactionOptions: { behavior: 'immediate' },
    }),
    logger: { options: { level: 'fatal' } },
    secret: 'unit-test-secret-that-is-longer-than-32-characters',
  })
  const payload = await getPayload({ config, key: databaseURL })
  const adapter: unknown = payload.db
  const clientConfig =
    typeof adapter === 'object' && adapter !== null && 'clientConfig' in adapter
      ? adapter.clientConfig
      : null
  const configuredURL =
    typeof clientConfig === 'object' && clientConfig !== null && 'url' in clientConfig
      ? clientConfig.url
      : null
  if (configuredURL !== databaseURL) {
    throw new Error('RBAC tests attempted to initialize a non-temporary database.')
  }
  return { databaseURL, directory, payload }
}

async function destroyHarness(harness: Harness): Promise<void> {
  await harness.payload.destroy()
  await rm(harness.directory, { force: true, recursive: true })
  restoreDatabaseURL()
}

function actingAs(user: User) {
  const { sessions, ...actor } = user
  return sessions ? { ...actor, sessions } : actor
}

async function bootstrapOwner(payload: Payload, email = 'owner@example.test'): Promise<User> {
  return payload.create({
    collection: 'users',
    data: {
      email,
      name: 'Owner',
      password: 'Testing!123456',
      roles: ['viewer'],
    },
    overrideAccess: false,
  })
}

async function createUser(
  payload: Payload,
  actor: User,
  email: string,
  roles: User['roles'],
): Promise<User> {
  return payload.create({
    collection: 'users',
    data: { email, name: email, password: 'Testing!123456', roles },
    overrideAccess: false,
    user: actingAs(actor),
  })
}

describe.sequential('users RBAC', () => {
  let bootstrapAttempts: PromiseSettledResult<User>[]
  let bootstrapUsers: User[]
  let templateDatabasePath: string
  let templateDirectory: string

  beforeAll(async () => {
    const template = await createHarness()
    templateDirectory = template.directory
    templateDatabasePath = path.join(template.directory, 'control.db')
    try {
      bootstrapAttempts = await Promise.allSettled([
        bootstrapOwner(template.payload, 'first@example.test'),
        bootstrapOwner(template.payload, 'second@example.test'),
      ])
      bootstrapUsers = (await template.payload.find({ collection: 'users', overrideAccess: true }))
        .docs
    } finally {
      await template.payload.destroy()
      restoreDatabaseURL()
    }
  })

  afterAll(async () => {
    await rm(templateDirectory, { force: true, recursive: true })
    restoreDatabaseURL()
  })

  it('serializes concurrent bootstrap attempts and creates one owner', async () => {
    expect(bootstrapAttempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
    expect(bootstrapAttempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1)
    expect(bootstrapUsers).toHaveLength(1)
    expect(bootstrapUsers[0]?.roles).toEqual(['owner'])
  })

  describe.sequential('with an existing owner', () => {
    let harness: Harness
    let owner: User

    beforeEach(async () => {
      harness = await createHarness(templateDatabasePath)
      const users = await harness.payload.find({ collection: 'users', overrideAccess: true })
      const existingOwner = users.docs[0]
      if (!existingOwner) throw new Error('The isolated RBAC fixture has no owner.')
      owner = existingOwner
    })

    afterEach(async () => {
      await destroyHarness(harness)
    })

    it('prevents admins from creating, changing, or deleting owners', async () => {
      const { payload } = harness
      const admin = await createUser(payload, owner, 'admin@example.test', ['admin'])

      await expect(createUser(payload, admin, 'intruder@example.test', ['owner'])).rejects.toThrow()
      await expect(
        payload.update({
          collection: 'users',
          data: { name: 'Changed by admin' },
          id: owner.id,
          overrideAccess: false,
          user: actingAs(admin),
        }),
      ).rejects.toThrow()
      await expect(
        payload.delete({
          collection: 'users',
          id: owner.id,
          overrideAccess: false,
          user: actingAs(admin),
        }),
      ).rejects.toThrow()
    })

    it('prevents an admin from promoting itself to owner', async () => {
      const { payload } = harness
      const admin = await createUser(payload, owner, 'self-admin@example.test', ['admin'])
      await expect(
        payload.update({
          collection: 'users',
          data: { roles: ['owner'] },
          id: admin.id,
          overrideAccess: false,
          user: actingAs(admin),
        }),
      ).rejects.toThrow('Admins cannot modify owners or assign the owner role.')
    })

    it('allows admins to manage non-owner accounts', async () => {
      const { payload } = harness
      const admin = await createUser(payload, owner, 'manager-admin@example.test', ['admin'])
      const viewer = await createUser(payload, admin, 'viewer@example.test', ['viewer'])

      const updated = await payload.update({
        collection: 'users',
        data: { name: 'Managed viewer', roles: ['operator'] },
        id: viewer.id,
        overrideAccess: false,
        user: actingAs(admin),
      })
      expect(updated.roles).toEqual(['operator'])

      await payload.delete({
        collection: 'users',
        id: viewer.id,
        overrideAccess: false,
        user: actingAs(admin),
      })
      await expect(payload.findByID({ collection: 'users', id: viewer.id })).rejects.toThrow()
    })

    it('limits non-administrators to reading their own account', async () => {
      const { payload } = harness
      const viewer = await createUser(payload, owner, 'private-viewer@example.test', ['viewer'])

      const visible = await payload.find({
        collection: 'users',
        overrideAccess: false,
        user: actingAs(viewer),
      })
      expect(visible.docs.map(({ id }) => id)).toEqual([viewer.id])
    })

    it('preserves the last owner during role changes and deletion', async () => {
      const { payload } = harness

      await expect(
        payload.update({
          collection: 'users',
          data: { roles: ['admin'] },
          id: owner.id,
          overrideAccess: false,
          user: actingAs(owner),
        }),
      ).rejects.toThrow('At least one owner account must remain.')
      await expect(
        payload.delete({
          collection: 'users',
          id: owner.id,
          overrideAccess: false,
          user: actingAs(owner),
        }),
      ).rejects.toThrow('At least one owner account must remain.')
    })

    it('allows an owner to step down when another owner remains', async () => {
      const { payload } = harness
      const secondOwner = await createUser(payload, owner, 'second-owner@example.test', ['owner'])

      const updated = await payload.update({
        collection: 'users',
        data: { roles: ['admin'] },
        id: secondOwner.id,
        overrideAccess: false,
        user: actingAs(secondOwner),
      })
      expect(updated.roles).toEqual(['admin'])
    })
  })
})
