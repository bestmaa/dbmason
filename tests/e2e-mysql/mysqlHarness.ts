import { createConnection } from 'mysql2/promise'
import type { Connection, RowDataPacket } from 'mysql2/promise'

export const remoteResources = {
  account: 'dbmason_e2e_mysql_reader@%',
  accountHost: '%',
  database: 'dbmason_e2e_mysql_database',
  table: 'dbmason_e2e_mysql_items',
  username: 'dbmason_e2e_mysql_reader',
} as const

export interface TestMySQLSettings {
  database: string
  host: string
  password: string
  port: number
  user: string
}

function requireSetting(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}. Prepare .env.mysql-test before E2E.`)
  return value
}

export function readTestMySQLSettings(): TestMySQLSettings {
  const host = requireSetting('MYSQL_TEST_HOST')
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('E2E MySQL must be bound to loopback; refusing a remote target.')
  }

  const port = Number(requireSetting('MYSQL_TEST_PORT'))
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('MYSQL_TEST_PORT must be a valid TCP port.')
  }

  const database = requireSetting('MYSQL_TEST_DATABASE')
  if (!database.toLowerCase().includes('test')) {
    throw new Error('MYSQL_TEST_DATABASE must be explicitly named as a test database.')
  }

  return {
    database,
    host,
    password: requireSetting('MYSQL_TEST_PASSWORD'),
    port,
    user: requireSetting('MYSQL_TEST_USER'),
  }
}

function quoteIdentifier(value: string): string {
  if (!/^dbmason_e2e_mysql_[a-z0-9_]+$/u.test(value)) {
    throw new Error(`Refusing a non-E2E MySQL identifier: ${value}`)
  }
  return `\`${value.replaceAll('`', '``')}\``
}

function quoteAccount(username: string, host: string): string {
  if (!/^dbmason_e2e_mysql_[a-z0-9_]+$/u.test(username) || host !== '%') {
    throw new Error(`Refusing a non-E2E MySQL account: ${username}@${host}`)
  }
  return `'${username}'@'${host}'`
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null
  return typeof error.code === 'string' ? error.code : null
}

async function adminClient(database?: string): Promise<Connection> {
  const settings = readTestMySQLSettings()
  return createConnection({
    connectTimeout: 10_000,
    ...(database ? { database } : {}),
    host: settings.host,
    multipleStatements: false,
    password: settings.password,
    port: settings.port,
    user: settings.user,
  })
}

async function restrictedClient(password: string, database?: string): Promise<Connection> {
  const settings = readTestMySQLSettings()
  return createConnection({
    connectTimeout: 10_000,
    ...(database ? { database } : {}),
    host: settings.host,
    multipleStatements: false,
    password,
    port: settings.port,
    user: remoteResources.username,
  })
}

export async function cleanupRemoteResources(): Promise<void> {
  const connection = await adminClient()
  try {
    await connection.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(remoteResources.database)}`)
    await connection.query(
      `DROP USER IF EXISTS ${quoteAccount(remoteResources.username, remoteResources.accountHost)}`,
    )
  } finally {
    await connection.end()
  }
}

export async function seedReadableTable(): Promise<void> {
  const connection = await adminClient(remoteResources.database)
  try {
    await connection.query(
      `CREATE TABLE ${quoteIdentifier(remoteResources.table)} (id integer PRIMARY KEY, label varchar(255) NOT NULL)`,
    )
    await connection.execute(
      `INSERT INTO ${quoteIdentifier(remoteResources.table)} (id, label) VALUES (?, ?)`,
      [1, 'visible to the read-only MySQL E2E account'],
    )
  } finally {
    await connection.end()
  }
}

export async function verifyReadOnlyLogin(oneTimePassword: string): Promise<{
  currentAccount: string | null
  insertDenied: boolean
  selectedLabel: string | null
}> {
  const connection = await restrictedClient(oneTimePassword, remoteResources.database)
  try {
    const [selected] = await connection.query<(RowDataPacket & { label: string })[]>(
      `SELECT label FROM ${quoteIdentifier(remoteResources.table)} WHERE id = ?`,
      [1],
    )
    const [identity] = await connection.query<(RowDataPacket & { account: string })[]>(
      'SELECT CURRENT_USER() AS account',
    )
    let insertDenied = false
    try {
      await connection.execute(
        `INSERT INTO ${quoteIdentifier(remoteResources.table)} (id, label) VALUES (?, ?)`,
        [2, 'must not be inserted'],
      )
    } catch (error: unknown) {
      insertDenied = errorCode(error) === 'ER_TABLEACCESS_DENIED_ERROR'
    }

    return {
      currentAccount: identity[0]?.account ?? null,
      insertDenied,
      selectedLabel: selected[0]?.label ?? null,
    }
  } finally {
    await connection.end()
  }
}

export async function verifyWritableLogin(oneTimePassword: string): Promise<void> {
  const connection = await restrictedClient(oneTimePassword, remoteResources.database)
  try {
    await connection.execute(
      `DELETE FROM ${quoteIdentifier(remoteResources.table)} WHERE id = ?`,
      [2],
    )
    await connection.execute(
      `INSERT INTO ${quoteIdentifier(remoteResources.table)} (id, label) VALUES (?, ?)`,
      [2, 'written through the managed MySQL account'],
    )
  } finally {
    await connection.end()
  }
}

export async function verifyLoginRejected(oneTimePassword: string): Promise<boolean> {
  let connection: Connection | null = null
  try {
    connection = await restrictedClient(oneTimePassword)
    await connection.query('SELECT 1')
    return false
  } catch (error: unknown) {
    return ['ER_ACCESS_DENIED_ERROR', 'ER_ACCOUNT_HAS_BEEN_LOCKED'].includes(
      errorCode(error) ?? '',
    )
  } finally {
    await connection?.end().catch(() => undefined)
  }
}

export async function verifySelectAccess(oneTimePassword: string): Promise<boolean> {
  let connection: Connection | null = null
  try {
    connection = await restrictedClient(oneTimePassword)
    await connection.query(
      `SELECT * FROM ${quoteIdentifier(remoteResources.database)}.${quoteIdentifier(remoteResources.table)}`,
    )
    return true
  } catch (error: unknown) {
    if (
      ['ER_ACCESS_DENIED_ERROR', 'ER_ACCOUNT_HAS_BEEN_LOCKED', 'ER_TABLEACCESS_DENIED_ERROR'].includes(
        errorCode(error) ?? '',
      )
    ) {
      return false
    }
    throw error
  } finally {
    await connection?.end().catch(() => undefined)
  }
}

export async function readSeededLabels(): Promise<readonly string[]> {
  const connection = await adminClient(remoteResources.database)
  try {
    const [rows] = await connection.query<(RowDataPacket & { label: string })[]>(
      `SELECT label FROM ${quoteIdentifier(remoteResources.table)} ORDER BY id`,
    )
    return rows.map(({ label }) => label)
  } finally {
    await connection.end()
  }
}

export async function remoteDatabaseExists(): Promise<boolean> {
  const connection = await adminClient()
  try {
    const [rows] = await connection.execute<(RowDataPacket & { present: number })[]>(
      'SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = ?) AS present',
      [remoteResources.database],
    )
    return rows[0]?.present === 1
  } finally {
    await connection.end()
  }
}
