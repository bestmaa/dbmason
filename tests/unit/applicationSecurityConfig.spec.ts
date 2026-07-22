import type { Payload } from 'payload'
import { extractJWT } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { nextConfig, securityHeaders } from '../../next.config'
import { buildServerAuthHeaders } from '@/security/serverAuthHeaders'

const secureEnvironment = {
  CONNECTION_ENCRYPTION_KEY: 'a'.repeat(64),
  DATABASE_URL: 'file:./security-config-test.db',
  DBMASON_PUBLIC_URL: 'https://dbmason.example',
  NODE_ENV: 'production',
  PAYLOAD_SECRET: 'security-config-test-secret-with-at-least-32-characters',
}

afterEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
})

async function loadPayloadConfig() {
  for (const [name, value] of Object.entries(secureEnvironment)) vi.stubEnv(name, value)
  const configuration = await import('@/payload.config')
  return configuration.default
}

describe('application security configuration', () => {
  it('trusts only the configured origin for origin-less server-rendered navigation', () => {
    const configuredOrigin = 'https://dbmason.example'
    const navigationHeaders = buildServerAuthHeaders(
      new Headers({ cookie: 'payload-token=x' }),
      configuredOrigin,
    )
    const foreignHeaders = buildServerAuthHeaders(
      new Headers({ origin: 'https://evil.example' }),
      configuredOrigin,
    )

    expect(navigationHeaders.get('origin')).toBe(configuredOrigin)
    expect(foreignHeaders.get('origin')).toBe('https://evil.example')
  })

  it(
    'disables third-party defaults and binds auth to the configured HTTPS origin',
    async () => {
      const config = await loadPayloadConfig()
      const users = config.collections.find(({ slug }) => slug === 'users')

      expect(config.admin.avatar).toBe('default')
      expect(config.cors).toEqual(['https://dbmason.example'])
      expect(config.csrf).toEqual(['https://dbmason.example'])
      expect(config.serverURL).toBe('https://dbmason.example')
      expect(config.telemetry).toBe(false)
      expect(users?.auth && typeof users.auth === 'object' ? users.auth.cookies.secure : null).toBe(
        true,
      )
    },
    15_000,
  )

  it(
    'rejects a foreign Origin when extracting a cookie JWT',
    async () => {
      const config = await loadPayloadConfig()
      const payload = { config } as unknown as Payload
      const cookie = `${config.cookiePrefix}-token=browser-session-token`

      expect(
        extractJWT({
          headers: new Headers({ Cookie: cookie, Origin: 'https://attacker.example' }),
          payload,
        }),
      ).toBeNull()
      expect(
        extractJWT({
          headers: new Headers({ Cookie: cookie, Origin: 'https://dbmason.example' }),
          payload,
        }),
      ).toBe('browser-session-token')
    },
    15_000,
  )

  it('sets conservative response headers and removes the Next.js signature', async () => {
    expect(nextConfig.poweredByHeader).toBe(false)
    await expect(nextConfig.headers?.()).resolves.toEqual([
      { headers: securityHeaders, source: '/:path*' },
    ])
    expect(securityHeaders).toEqual(
      expect.arrayContaining([
        {
          key: 'Content-Security-Policy',
          value: "base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        },
        { key: 'Permissions-Policy', value: expect.stringContaining('camera=()') },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ]),
    )
  })
})
