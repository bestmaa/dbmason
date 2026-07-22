import { describe, expect, it } from 'vitest'

import { ManagerError, toManagerError } from '@/modules/database-manager/domain/errors'

describe('toManagerError', () => {
  it.each([
    ['42P04', 'ALREADY_EXISTS', 409],
    ['42710', 'ALREADY_EXISTS', 409],
    ['42704', 'RESOURCE_NOT_FOUND', 404],
    ['2BP01', 'RESOURCE_HAS_DEPENDENCIES', 409],
    ['55006', 'RESOURCE_IN_USE', 409],
  ])('maps PostgreSQL %s to %s', (postgresCode, expectedCode, expectedStatus) => {
    const error = toManagerError({ code: postgresCode })
    expect(error).toMatchObject({ code: expectedCode, status: expectedStatus })
  })

  it('preserves explicit protected-principal errors', () => {
    const protectedError = new ManagerError('PROTECTED_PRINCIPAL', 'Protected.', 409)
    expect(toManagerError(protectedError)).toBe(protectedError)
  })
})
