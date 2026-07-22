import { ManagerError } from '../../domain/errors'

const maximumIdentifierBytes = 64
const maximumUserBytes = 32
const maximumHostBytes = 255
const safeUserPattern = /^[A-Za-z0-9_.-]+$/u
const safeHostPattern = /^[A-Za-z0-9.:-]+$/u

export interface MysqlAccount {
  canonical: string
  host: string
  user: string
}

export function quoteMysqlIdentifier(value: string): string {
  const bytes = Buffer.byteLength(value, 'utf8')
  if (bytes === 0 || bytes > maximumIdentifierBytes || value.includes('\0')) {
    throw new ManagerError(
      'INVALID_INPUT',
      `MySQL identifiers must be 1-${maximumIdentifierBytes} UTF-8 bytes.`,
      400,
    )
  }
  return `\`${value.replaceAll('`', '``')}\``
}

export function parseMysqlAccount(value: string): MysqlAccount {
  const separator = value.lastIndexOf('@')
  const user = separator > 0 ? value.slice(0, separator) : ''
  const host = separator > 0 ? value.slice(separator + 1) : ''
  const userBytes = Buffer.byteLength(user, 'utf8')
  const hostBytes = Buffer.byteLength(host, 'utf8')
  if (
    separator !== value.indexOf('@') ||
    userBytes === 0 ||
    userBytes > maximumUserBytes ||
    hostBytes === 0 ||
    hostBytes > maximumHostBytes ||
    !safeUserPattern.test(user) ||
    (host !== '%' && !safeHostPattern.test(host))
  ) {
    throw new ManagerError(
      'INVALID_INPUT',
      'Use an explicit MySQL account in user@host form (for example app_reader@%).',
      400,
    )
  }
  return { canonical: `${user}@${host}`, host, user }
}

export function quoteMysqlAccount(account: MysqlAccount): string {
  return `'${account.user}'@'${account.host}'`
}

export function isMysqlSystemSchema(database: string): boolean {
  return ['information_schema', 'mysql', 'performance_schema', 'sys'].includes(
    database.toLowerCase(),
  )
}
