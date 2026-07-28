import { describe, expect, it } from 'vitest'

import { getSafeInternalRedirect } from '@/security/internalRedirect'

const origin = 'https://dbmason.example'

describe('internal redirect validation', () => {
  it('keeps valid same-origin paths, queries, and fragments', () => {
    const cases = [
      ['/', '/'],
      [
        '/admin/collections/users?status=active#member',
        '/admin/collections/users?status=active#member',
      ],
    ] as const

    for (const [requested, expected] of cases) {
      const redirect = getSafeInternalRedirect(requested, origin)
      expect(redirect).toBe(expected)
      expect(new URL(redirect, origin).origin).toBe(origin)
    }
  })

  it('normalizes safe path traversal without leaving the configured origin', () => {
    const redirect = getSafeInternalRedirect('/admin/../account', origin)

    expect(redirect).toBe('/account')
    expect(new URL(redirect, origin).origin).toBe(origin)
  })

  it('rejects absolute, protocol-relative, and backslash redirects', () => {
    for (const redirect of [
      'https://evil.example/',
      '//evil.example/',
      String.raw`/\evil.example/`,
      '/%5cevil.example/',
    ]) {
      expect(getSafeInternalRedirect(redirect, origin)).toBe('/')
    }
  })

  it('rejects encoded controls before browser URL normalization', () => {
    for (const redirect of [
      '/%09/evil.example/',
      '/%0a/evil.example/',
      '/%0d/evil.example/',
      '/%2509/evil.example/',
      `/\tevil.example/`,
    ]) {
      expect(getSafeInternalRedirect(redirect, origin)).toBe('/')
    }
  })

  it('rejects encoded protocol-relative redirects at every decoding layer', () => {
    for (const redirect of [
      '/%2f%2fevil.example/',
      '/%252f%252fevil.example/',
      '/%2e%2e//evil.example/',
      '/.%2e//evil.example/',
      '/foo/%2e%2e//evil.example/',
    ]) {
      expect(getSafeInternalRedirect(redirect, origin)).toBe('/')
    }
  })

  it('uses a validated fallback for absent or malformed input', () => {
    expect(getSafeInternalRedirect(undefined, origin, '/login')).toBe('/login')
    expect(getSafeInternalRedirect('/broken%', origin, '/login')).toBe('/login')
    expect(getSafeInternalRedirect('/safe', origin, '//evil.example')).toBe('/safe')
    expect(getSafeInternalRedirect(undefined, origin, '//evil.example')).toBe('/')
  })
})
