import { describe, expect, it } from 'vitest'

import { parseServerEnv } from '@/config/env'

const validEnvironment = {
  CONNECTION_ENCRYPTION_KEY: 'a'.repeat(64),
  DATABASE_URL: 'file:./control.db',
  DBMASON_PUBLIC_URL: 'http://localhost:3010',
  PAYLOAD_SECRET: 'a-private-test-secret-with-at-least-32-characters',
}

describe('server environment validation', () => {
  it('accepts private values and supplies the optional allowlist default', () => {
    expect(parseServerEnv(validEnvironment)).toMatchObject({
      DATABASE_HOST_ALLOWLIST: '',
      DATABASE_URL: 'file:./control.db',
      DBMASON_PUBLIC_URL: 'http://localhost:3010',
    })
  })

  it('derives a loopback development origin from PORT when the URL is omitted', () => {
    expect(parseServerEnv({ ...validEnvironment, DBMASON_PUBLIC_URL: undefined, PORT: '4010' }))
      .toMatchObject({ DBMASON_PUBLIC_URL: 'http://localhost:4010', PORT: 4010 })
  })

  it('requires an explicit public origin in production', () => {
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        DBMASON_PUBLIC_URL: undefined,
        NODE_ENV: 'production',
      }),
    ).toThrow('DBMASON_PUBLIC_URL is required in production.')
  })

  it('requires HTTPS for every non-loopback public origin', () => {
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        DBMASON_PUBLIC_URL: 'http://dbmason.example',
      }),
    ).toThrow('DBMASON_PUBLIC_URL requires HTTPS unless it uses an exact loopback host.')
  })

  it('accepts HTTPS and exact IPv4 and IPv6 loopback origins', () => {
    expect(
      parseServerEnv({ ...validEnvironment, DBMASON_PUBLIC_URL: 'https://dbmason.example/' })
        .DBMASON_PUBLIC_URL,
    ).toBe('https://dbmason.example')
    expect(
      parseServerEnv({
        ...validEnvironment,
        DBMASON_PUBLIC_URL: 'http://127.0.0.1:3010',
        NODE_ENV: 'production',
      })
        .DBMASON_PUBLIC_URL,
    ).toBe('http://127.0.0.1:3010')
    expect(
      parseServerEnv({ ...validEnvironment, DBMASON_PUBLIC_URL: 'http://[::1]:3010' })
        .DBMASON_PUBLIC_URL,
    ).toBe('http://[::1]:3010')
  })

  it('rejects alternate loopback spellings instead of normalizing them into an exception', () => {
    for (const publicURL of ['http://127.1:3010', 'http://2130706433:3010']) {
      expect(() =>
        parseServerEnv({ ...validEnvironment, DBMASON_PUBLIC_URL: publicURL }),
      ).toThrow('DBMASON_PUBLIC_URL requires HTTPS unless it uses an exact loopback host.')
    }
  })

  it('rejects a URL containing credentials, a path, a query, or a fragment', () => {
    for (const publicURL of [
      'https://user:pass@dbmason.example',
      'https://dbmason.example/admin',
      'https://dbmason.example?proxy=true',
      'https://dbmason.example#admin',
    ]) {
      expect(() =>
        parseServerEnv({ ...validEnvironment, DBMASON_PUBLIC_URL: publicURL }),
      ).toThrow(
        'DBMASON_PUBLIC_URL must be an origin without credentials, path, query, or fragment.',
      )
    }
  })

  it('rejects the public Payload secret example even though it is long enough', () => {
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        PAYLOAD_SECRET: 'replace-with-at-least-32-random-characters',
      }),
    ).toThrow('PAYLOAD_SECRET must not use the public example value.')
  })
})
