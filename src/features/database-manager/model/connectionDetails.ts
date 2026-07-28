import type {
  ConnectionSummary,
  EngineId,
  PrincipalSummary,
  SslMode,
} from '@/modules/database-manager/domain/contracts'

export interface ConnectionEndpoint {
  host: string
  port: number
  sslMode: SslMode
}

export interface ConnectionPrincipalOption {
  authenticationUsername: string
  label: string
  value: string
}

function encodeComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function uriHost(host: string): string {
  return host.includes(':') && /^[A-Fa-f\d:.]+$/u.test(host) ? `[${host}]` : encodeComponent(host)
}

export function buildConnectionUri(input: {
  database: string
  endpoint: ConnectionEndpoint
  engine: EngineId
  password: string
  username: string
}): string {
  const scheme = input.engine === 'postgresql' ? 'postgresql' : 'mysql'
  const authority = `${encodeComponent(input.username)}:${encodeComponent(input.password)}@${uriHost(input.endpoint.host)}:${input.endpoint.port}`
  const path = encodeComponent(input.database)
  const tls =
    input.engine === 'postgresql' ? `?sslmode=${encodeComponent(input.endpoint.sslMode)}` : ''
  return `${scheme}://${authority}/${path}${tls}`
}

export function internalEndpoint(connection: ConnectionSummary): ConnectionEndpoint {
  return {
    host: connection.host,
    port: connection.port,
    sslMode: connection.sslMode,
  }
}

export function externalEndpoint(connection: ConnectionSummary): ConnectionEndpoint | null {
  if (
    !connection.externalHost ||
    connection.externalPort === null ||
    connection.externalSslMode === null
  ) {
    return null
  }
  return {
    host: connection.externalHost,
    port: connection.externalPort,
    sslMode: connection.externalSslMode,
  }
}

export function connectionPrincipalOptions(
  principals: readonly PrincipalSummary[],
  currentUser: string,
): readonly ConnectionPrincipalOption[] {
  return principals
    .filter(
      (principal) =>
        principal.canLogin &&
        !principal.isSuperuser &&
        !principal.canCreateDatabase &&
        !principal.canCreateRole &&
        principal.memberships.length === 0 &&
        principal.name !== currentUser &&
        !principal.name.startsWith('mysql.'),
    )
    .map((principal) => ({
      authenticationUsername: principal.authenticationUsername,
      label: principal.name,
      value: principal.name,
    }))
}
