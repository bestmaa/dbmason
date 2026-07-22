import { beforeAll, describe, expect, it } from 'vitest'

import type { DatabaseConnectionConfig } from '@/modules/database-manager/domain/contracts'

const secret: DatabaseConnectionConfig = {
  database: 'postgres',
  host: 'db.internal',
  password: 'not-stored-in-cleartext',
  port: 5432,
  sslMode: 'verify-full',
  username: 'manager',
}

beforeAll(() => {
  process.env.CONNECTION_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.DATABASE_URL = 'file:./test.db'
  process.env.PAYLOAD_SECRET = 'test-secret-that-is-longer-than-32-characters'
})

describe('credentialVault', () => {
  it('round-trips credentials without exposing plaintext', async () => {
    const vault = await import('@/modules/database-manager/infrastructure/security/credentialVault')
    const encrypted = vault.encryptConnectionSecret('connection-1', secret)
    expect(encrypted).not.toContain(secret.password)
    expect(vault.decryptConnectionSecret('connection-1', encrypted)).toEqual(secret)
  })

  it('rejects a different associated connection id', async () => {
    const vault = await import('@/modules/database-manager/infrastructure/security/credentialVault')
    const encrypted = vault.encryptConnectionSecret('connection-1', secret)
    expect(() => vault.decryptConnectionSecret('connection-2', encrypted)).toThrow()
  })

  it('uses a fresh initialization vector for every encryption', async () => {
    const vault = await import('@/modules/database-manager/infrastructure/security/credentialVault')
    expect(vault.encryptConnectionSecret('connection-1', secret)).not.toBe(
      vault.encryptConnectionSecret('connection-1', secret),
    )
  })
})
