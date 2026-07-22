import { describe, expect, it } from 'vitest'

import {
  isForbiddenDatabaseAddress,
  matchesHostAllowlist,
} from '@/modules/database-manager/infrastructure/postgresql/hostPolicy'

describe('database host policy', () => {
  it('blocks metadata, unspecified, link-local, and multicast addresses', () => {
    expect(isForbiddenDatabaseAddress('169.254.169.254')).toBe(true)
    expect(isForbiddenDatabaseAddress('100.100.100.200')).toBe(true)
    expect(isForbiddenDatabaseAddress('0.0.0.0')).toBe(true)
    expect(isForbiddenDatabaseAddress('224.0.0.1')).toBe(true)
    expect(isForbiddenDatabaseAddress('fe80::1')).toBe(true)
    expect(isForbiddenDatabaseAddress('fe80:0:0:0:0:0:0:1')).toBe(true)
    expect(isForbiddenDatabaseAddress('fe80::1%eth0')).toBe(true)
    expect(isForbiddenDatabaseAddress('fd00:ec2::254')).toBe(true)
    expect(isForbiddenDatabaseAddress('fd00:0ec2:0000:0000:0000:0000:0000:0254')).toBe(true)
    expect(isForbiddenDatabaseAddress('0:0:0:0:0:ffff:169.254.169.254')).toBe(true)
    expect(isForbiddenDatabaseAddress('ff02::1')).toBe(true)
  })

  it('allows loopback, private, and ordinary public addresses', () => {
    expect(isForbiddenDatabaseAddress('127.0.0.1')).toBe(false)
    expect(isForbiddenDatabaseAddress('10.20.30.40')).toBe(false)
    expect(isForbiddenDatabaseAddress('192.0.2.10')).toBe(false)
    expect(isForbiddenDatabaseAddress('2001:db8::10')).toBe(false)
  })

  it('matches exact hosts and wildcard subdomains without matching the wildcard root', () => {
    const allowlist = 'localhost, db.internal, *.db.example.com'
    expect(matchesHostAllowlist('LOCALHOST', allowlist)).toBe(true)
    expect(matchesHostAllowlist('primary.db.example.com', allowlist)).toBe(true)
    expect(matchesHostAllowlist('db.example.com', allowlist)).toBe(false)
    expect(matchesHostAllowlist('evil.example.com', allowlist)).toBe(false)
  })
})
