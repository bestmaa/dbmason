import type { AccessLevel } from '@/modules/database-manager/domain/contracts'

export interface AccessLevelOption {
  label: string
  value: AccessLevel
}

const labels: Readonly<Record<AccessLevel, string>> = {
  connect: 'Connect only',
  developer: 'Developer',
  read: 'Read only',
  write: 'Read & write',
}

export function buildAccessLevelOptions(
  levels: readonly AccessLevel[],
): readonly AccessLevelOption[] {
  return levels.map((value) => ({ label: labels[value], value }))
}

export function preferredAccessLevel(levels: readonly AccessLevel[]): AccessLevel {
  return levels.find((level) => level === 'read') ?? levels[0] ?? 'connect'
}

export function parseAvailableAccessLevel(
  value: unknown,
  levels: readonly AccessLevel[],
): AccessLevel | null {
  return levels.find((level) => level === value) ?? null
}
