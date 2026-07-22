import { describe, expect, it } from 'vitest'

import { shouldRetryWithoutTls } from '@/modules/database-manager/infrastructure/postgresql/postgresClient'

describe('PostgreSQL TLS preference fallback', () => {
  it('allows plaintext retry only for the explicit server SSL-unsupported response', () => {
    expect(shouldRetryWithoutTls(new Error('The server does not support SSL connections'))).toBe(true)
    expect(shouldRetryWithoutTls(new Error('certificate has expired'))).toBe(false)
    expect(shouldRetryWithoutTls(new Error('self-signed certificate'))).toBe(false)
    expect(shouldRetryWithoutTls(new Error('connection reset'))).toBe(false)
    expect(shouldRetryWithoutTls({ message: 'The server does not support SSL connections' })).toBe(
      false,
    )
  })
})
