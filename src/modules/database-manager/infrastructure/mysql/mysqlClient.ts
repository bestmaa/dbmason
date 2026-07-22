import { connect as connectTcp } from 'node:net'
import { checkServerIdentity, TLSSocket } from 'node:tls'

import { createConnection } from 'mysql2/promise'
import type { Connection, ConnectionOptions, SslOptions } from 'mysql2/promise'

import type { DatabaseConnectionConfig, SslMode } from '../../domain/contracts'
import { ManagerError } from '../../domain/errors'
import { resolveAllowedDatabaseHost } from '../network/databaseHostPolicy'
import { mysqlOperationLimiter } from './operationLimiter'

function resolveSsl(mode: SslMode): SslOptions | undefined {
  if (mode === 'disable') return undefined
  return {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: mode === 'verify-full',
    verifyIdentity: mode === 'verify-full',
  }
}

function connectionOptions(
  config: DatabaseConnectionConfig,
  database: string,
  resolvedHost: string,
): ConnectionOptions {
  const options: ConnectionOptions = {
    bigNumberStrings: true,
    charset: 'utf8mb4',
    connectTimeout: 5_000,
    database,
    dateStrings: true,
    decimalNumbers: false,
    enableKeepAlive: false,
    // mysql2 derives TLS SNI/identity from `host`. Keep the requested host
    // here, while the custom socket pins the already-vetted DNS result.
    host: config.host,
    multipleStatements: false,
    password: config.password,
    port: config.port,
    supportBigNumbers: true,
    stream: () => {
      const socket = connectTcp({ host: resolvedHost, port: config.port })
      socket.setNoDelay(true)
      return socket
    },
    timezone: 'Z',
    user: config.username,
  }
  const ssl = resolveSsl(config.sslMode)
  if (ssl !== undefined) options.ssl = ssl
  return options
}

function findTlsSocket(value: unknown, depth = 0): TLSSocket | null {
  if (value instanceof TLSSocket) return value
  if (depth >= 3 || typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  return (
    findTlsSocket(record.stream, depth + 1) ?? findTlsSocket(record.connection, depth + 1)
  )
}

export function assertMysqlPeerIdentity(
  connection: unknown,
  config: Pick<DatabaseConnectionConfig, 'host' | 'sslMode'>,
): void {
  if (config.sslMode !== 'verify-full') return
  const socket = findTlsSocket(connection)
  if (!socket?.encrypted) {
    throw new ManagerError(
      'TLS_IDENTITY_UNAVAILABLE',
      'MySQL verify-full could not inspect the TLS peer identity.',
      502,
    )
  }
  const identityError = checkServerIdentity(config.host, socket.getPeerCertificate(true))
  if (identityError) {
    throw new ManagerError(
      'TLS_IDENTITY_FAILED',
      'The MySQL certificate does not match the configured database host.',
      502,
      { cause: identityError },
    )
  }
}

function shouldRetryWithoutTls(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = 'code' in error && typeof error.code === 'string' ? error.code : ''
  const message = error.message.toLowerCase()
  return code === 'HANDSHAKE_NO_SSL_SUPPORT' || message.includes('does not support secure connection')
}

async function closeConnection(connection: Connection): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const ended = await Promise.race([
      connection.end().then(
        () => true,
        () => false,
      ),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), 1_000)
      }),
    ])
    if (!ended) connection.destroy()
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function withMysqlConnection<T>(
  config: DatabaseConnectionConfig,
  database: string,
  operation: (connection: Connection) => Promise<T>,
): Promise<T> {
  const release = await mysqlOperationLimiter.acquire()
  let connection: Connection | null = null
  let operationDeadline: ReturnType<typeof setTimeout> | undefined
  try {
    const resolvedHost = await resolveAllowedDatabaseHost(config.host)
    try {
      connection = await createConnection(connectionOptions(config, database, resolvedHost))
    } catch (error) {
      if (config.sslMode !== 'prefer' || !shouldRetryWithoutTls(error)) throw error
      connection = await createConnection(
        connectionOptions({ ...config, sslMode: 'disable' }, database, resolvedHost),
      )
    }
    assertMysqlPeerIdentity(connection, config)
    await connection.query('SET SESSION max_execution_time = 15000')
    await connection.query('SET SESSION lock_wait_timeout = 5')
    await connection.query('SET SESSION innodb_lock_wait_timeout = 5')
    const activeConnection = connection
    return await Promise.race([
      operation(connection),
      new Promise<T>((_resolve, reject) => {
        operationDeadline = setTimeout(() => {
          activeConnection.destroy()
          reject(
            new ManagerError(
              'DATABASE_OPERATION_TIMEOUT',
              'The MySQL operation exceeded its hard time limit.',
              504,
            ),
          )
        }, 20_000)
      }),
    ])
  } finally {
    if (operationDeadline) clearTimeout(operationDeadline)
    try {
      if (connection) await closeConnection(connection)
    } finally {
      release()
    }
  }
}

export { connectionOptions, shouldRetryWithoutTls }
