import { describe, expect, it } from 'vitest'

import {
  buildTotpUri,
  generateHotpCode,
  generateTotpCode,
  generateTotpSecret,
  totpPeriodSeconds,
  verifyTotpCode,
} from '@/auth/two-factor/totp'

describe('TOTP authentication', () => {
  it('matches the RFC 6238 SHA-1 vectors', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
    const vectors = [
      [59, '94287082'],
      [1_111_111_109, '07081804'],
      [1_111_111_111, '14050471'],
      [1_234_567_890, '89005924'],
      [2_000_000_000, '69279037'],
      [20_000_000_000, '65353130'],
    ] as const

    for (const [seconds, expected] of vectors) {
      expect(generateHotpCode(secret, Math.floor(seconds / totpPeriodSeconds), 8)).toBe(expected)
    }
  })

  it('accepts only the configured clock window and rejects counter replay', () => {
    const secret = generateTotpSecret()
    const now = 1_800_000_000_000
    const currentCode = generateTotpCode(secret, now)
    const previousCode = generateTotpCode(secret, now - totpPeriodSeconds * 1000)
    const tooOldCode = generateTotpCode(secret, now - 2 * totpPeriodSeconds * 1000)
    const counter = verifyTotpCode(secret, currentCode, { now })

    expect(counter).not.toBeNull()
    expect(verifyTotpCode(secret, previousCode, { now })).not.toBeNull()
    expect(verifyTotpCode(secret, tooOldCode, { now })).toBeNull()
    expect(
      verifyTotpCode(secret, currentCode, {
        minimumCounterExclusive: counter ?? 0,
        now,
      }),
    ).toBeNull()
  })

  it('builds a Google and Microsoft Authenticator compatible URI', () => {
    const uri = new URL(buildTotpUri('owner+test@example.com', 'JBSWY3DPEHPK3PXP'))
    expect(uri.protocol).toBe('otpauth:')
    expect(uri.hostname).toBe('totp')
    expect(uri.searchParams.get('issuer')).toBe('DBMason')
    expect(uri.searchParams.get('algorithm')).toBe('SHA1')
    expect(uri.searchParams.get('digits')).toBe('6')
    expect(uri.searchParams.get('period')).toBe('30')
  })

  it('rejects malformed codes without throwing', () => {
    const secret = generateTotpSecret()
    for (const code of ['', '12345', '1234567', 'abcdef']) {
      expect(verifyTotpCode(secret, code)).toBeNull()
    }
  })
})
