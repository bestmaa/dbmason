import { describe, expect, it } from 'vitest'

import { generateDatabasePassword } from '@/modules/database-manager/infrastructure/security/passwordGenerator'

describe('generateDatabasePassword', () => {
  it('uses a URL-safe alphabet and 192 bits by default', () => {
    const password = generateDatabasePassword()
    expect(password).toHaveLength(32)
    expect(password).toMatch(/^[A-Za-z\d_-]+$/u)
  })

  it('does not repeat passwords in a basic smoke test', () => {
    const passwords = new Set(Array.from({ length: 100 }, () => generateDatabasePassword()))
    expect(passwords.size).toBe(100)
  })

  it('rejects unsafe entropy sizes', () => {
    expect(() => generateDatabasePassword(15)).toThrow(RangeError)
    expect(() => generateDatabasePassword(65)).toThrow(RangeError)
  })
})
