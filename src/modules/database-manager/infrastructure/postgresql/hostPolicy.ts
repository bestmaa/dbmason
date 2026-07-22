import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import { getServerEnv } from '@/config/env'

const blockedHostnames = new Set(['instance-data', 'metadata', 'metadata.google.internal'])
const blockedAddresses = new Set(['100.100.100.200', 'fd00:ec2::254'])

export class DatabaseHostPolicyError extends Error {
  readonly code = 'DATABASE_HOST_BLOCKED'

  constructor() {
    super('The database host is blocked by the outbound host policy.')
    this.name = 'DatabaseHostPolicyError'
  }
}

function normalizedHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/u, '')
}

function canonicalAddress(address: string): string {
  const normalized = normalizedHost(address)
  if (isIP(normalized) !== 6) return normalized
  const hostname = new URL(`http://[${normalized}]/`).hostname
  return hostname.slice(1, -1)
}

export function matchesHostAllowlist(host: string, configuredAllowlist: string): boolean {
  const candidate = normalizedHost(host)
  return configuredAllowlist
    .split(',')
    .map(normalizedHost)
    .filter(Boolean)
    .some((entry) =>
      entry.startsWith('*.')
        ? candidate.endsWith(entry.slice(1)) && candidate !== entry.slice(2)
        : candidate === entry,
    )
}

function isForbiddenIpv4(address: string): boolean {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) return true
  const first = octets[0] ?? -1
  const second = octets[1] ?? -1
  return first === 0 || (first === 169 && second === 254) || first >= 224
}

export function isForbiddenDatabaseAddress(address: string): boolean {
  let normalized: string
  try {
    normalized = canonicalAddress(address)
  } catch {
    return true
  }
  if (blockedAddresses.has(normalized)) return true
  if (isIP(normalized) === 4) return isForbiddenIpv4(normalized)
  if (isIP(normalized) !== 6) return true

  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length)
    return isIP(mapped) === 4 ? isForbiddenIpv4(mapped) : true
  }

  return (
    normalized === '::' ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff')
  )
}

export async function resolveAllowedDatabaseHost(host: string): Promise<string> {
  const candidate = normalizedHost(host)
  const allowlist = getServerEnv().DATABASE_HOST_ALLOWLIST
  if (allowlist && !matchesHostAllowlist(candidate, allowlist)) throw new DatabaseHostPolicyError()
  if (blockedHostnames.has(candidate)) throw new DatabaseHostPolicyError()

  if (isIP(candidate)) {
    if (isForbiddenDatabaseAddress(candidate)) throw new DatabaseHostPolicyError()
    return candidate
  }

  const results = await lookup(candidate, { all: true, verbatim: true })
  if (results.length === 0 || results.some(({ address }) => isForbiddenDatabaseAddress(address))) {
    throw new DatabaseHostPolicyError()
  }
  return results[0]?.address ?? candidate
}
