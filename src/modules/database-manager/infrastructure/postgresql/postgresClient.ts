import { isIP } from 'node:net'
import { Client } from 'pg'
import type { ClientConfig } from 'pg'

import type { DatabaseConnectionConfig, SslMode } from '../../domain/contracts'
import { resolveAllowedDatabaseHost } from './hostPolicy'
import { postgresOperationLimiter } from './operationLimiter'

function resolveSsl(mode: SslMode, servername: string): ClientConfig['ssl'] | undefined {
  if (mode === 'disable') return undefined
  const peerName = isIP(servername) ? {} : { servername }
  if (mode === 'prefer' || mode === 'require') {
    return { ...peerName, rejectUnauthorized: false }
  }
  return { ...peerName, rejectUnauthorized: true }
}

export function shouldRetryWithoutTls(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.trim().toLowerCase() === 'the server does not support ssl connections'
}

async function closeClient(client: Client): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      Promise.resolve()
        .then(() => client.end())
        .then(
          () => 'ended' as const,
          () => 'failed' as const,
        ),
      new Promise<'timeout'>((resolve) => {
        timeout = setTimeout(() => resolve('timeout'), 1_000)
      }),
    ])
    if (result !== 'ended') client.connection.stream.destroy()
  } catch {
    try {
      client.connection.stream.destroy()
    } catch {
      // The connection is already unusable; cleanup must remain best effort.
    }
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function createClientConfig(
  connection: DatabaseConnectionConfig,
  database: string,
  resolvedHost: string,
): ClientConfig {
  const config: ClientConfig = {
    application_name: 'db-control',
    connectionTimeoutMillis: 5_000,
    database,
    host: resolvedHost,
    idle_in_transaction_session_timeout: 10_000,
    password: connection.password,
    port: connection.port,
    query_timeout: 15_000,
    statement_timeout: 15_000,
    user: connection.username,
  }
  const ssl = resolveSsl(connection.sslMode, connection.host)
  if (ssl !== undefined) config.ssl = ssl
  return config
}

export async function withPostgresClient<T>(
  connection: DatabaseConnectionConfig,
  database: string,
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  const release = await postgresOperationLimiter.acquire()
  let client: Client | null = null

  try {
    const resolvedHost = await resolveAllowedDatabaseHost(connection.host)
    client = new Client(createClientConfig(connection, database, resolvedHost))
    try {
      await client.connect()
    } catch (error) {
      if (connection.sslMode !== 'prefer' || !shouldRetryWithoutTls(error)) throw error
      await closeClient(client)
      client = new Client(
        createClientConfig({ ...connection, sslMode: 'disable' }, database, resolvedHost),
      )
      await client.connect()
    }
    return await operation(client)
  } finally {
    try {
      if (client) await closeClient(client)
    } finally {
      release()
    }
  }
}
