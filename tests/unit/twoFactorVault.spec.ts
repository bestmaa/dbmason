import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  process.env.CONNECTION_ENCRYPTION_KEY = 'b'.repeat(64)
  process.env.DATABASE_URL = 'file:./two-factor-vault-test.db'
  process.env.DBMASON_PUBLIC_URL = 'http://localhost:3010'
  process.env.PAYLOAD_SECRET = 'two-factor-vault-test-secret-at-least-32-characters'
})

describe('two-factor secret storage', () => {
  it('encrypts secrets with binding-specific authenticated data', async () => {
    const vault = await import('@/auth/two-factor/vault')
    const secret = 'JBSWY3DPEHPK3PXP'
    const encrypted = vault.encryptTotpSecret('user:1', secret)

    expect(encrypted).not.toContain(secret)
    expect(vault.decryptTotpSecret('user:1', encrypted)).toBe(secret)
    expect(() => vault.decryptTotpSecret('user:2', encrypted)).toThrow()
  })

  it('uses a fresh IV for every encryption', async () => {
    const vault = await import('@/auth/two-factor/vault')
    expect(vault.encryptTotpSecret('user:1', 'SAMESECRET')).not.toBe(
      vault.encryptTotpSecret('user:1', 'SAMESECRET'),
    )
  })

  it('generates one-use recovery material and stores only keyed hashes', async () => {
    const vault = await import('@/auth/two-factor/vault')
    const codes = vault.generateRecoveryCodes()
    const hashes = codes.map(vault.hashRecoveryCode)

    expect(codes).toHaveLength(8)
    expect(new Set(codes).size).toBe(8)
    expect(hashes.join(' ')).not.toContain(codes[0] ?? 'missing-code')
    expect(vault.findRecoveryCodeHash(codes[0] ?? '', hashes)).toBe(hashes[0])
    expect(vault.findRecoveryCodeHash('WRONG-WRONG-WRONG-WRONG', hashes)).toBeNull()
  })
})
