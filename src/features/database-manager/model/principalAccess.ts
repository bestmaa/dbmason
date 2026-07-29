import type {
  AccessPresetMatch,
  AccessSource,
} from '@/modules/database-manager/domain/contracts'

const presetLabels = {
  connect: 'Connect',
  custom: 'Custom',
  developer: 'Developer',
  none: 'No database access',
  read: 'Read only',
  unknown: 'Unknown',
  write: 'Read & write',
} satisfies Readonly<Record<AccessPresetMatch, string>>

const sourceLabels = {
  direct: 'Direct',
  global: 'Global',
  inherited: 'Inherited',
  ownership: 'Owner',
  privileged: 'Privileged role',
  proxy: 'Proxy',
  public: 'PUBLIC',
  'role-switch': 'Role switch',
} satisfies Readonly<Record<AccessSource, string>>

export function directPresetLabel(match: AccessPresetMatch): string {
  if (match === 'none') return 'No direct grant'
  if (match === 'custom') return 'Custom grants'
  if (match === 'unknown') return 'Unknown'
  return `Matches ${presetLabels[match]}`
}

export function effectiveAccessLabel(match: AccessPresetMatch): string {
  return presetLabels[match]
}

export function accessSourceLabel(source: AccessSource): string {
  return sourceLabels[source]
}

export function accessTone(match: AccessPresetMatch): string {
  if (match === 'custom' || match === 'unknown') return ' access-status--warning'
  if (match === 'none') return ' access-status--muted'
  if (match === 'developer') return ' access-status--danger'
  return ' access-status--active'
}
