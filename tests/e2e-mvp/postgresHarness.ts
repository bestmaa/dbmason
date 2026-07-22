import { Client } from 'pg'

export const remoteResources = {
  database: 'dbcontrol_e2e_database',
  principal: 'dbcontrol_e2e_reader',
  table: 'dbcontrol_e2e_items',
} as const

interface TestPostgresSettings {
  database: string
  host: string
  password: string
  port: number
  user: string
}

function requireSetting(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}. Prepare .env.postgres-test before E2E.`)
  return value
}

export function readTestPostgresSettings(): TestPostgresSettings {
  const host = requireSetting('POSTGRES_TEST_HOST')
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('E2E PostgreSQL must be bound to loopback; refusing a remote target.')
  }

  const port = Number(requireSetting('POSTGRES_TEST_PORT'))
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('POSTGRES_TEST_PORT must be a valid TCP port.')
  }

  const database = requireSetting('POSTGRES_TEST_DATABASE')
  if (!database.toLowerCase().includes('test')) {
    throw new Error('POSTGRES_TEST_DATABASE must be explicitly named as a test database.')
  }

  return {
    database,
    host,
    password: requireSetting('POSTGRES_TEST_PASSWORD'),
    port,
    user: requireSetting('POSTGRES_TEST_USER'),
  }
}

function quoteIdentifier(value: string): string {
  if (!/^dbcontrol_e2e_[a-z0-9_]+$/u.test(value)) {
    throw new Error(`Refusing a non-E2E PostgreSQL identifier: ${value}`)
  }
  return `"${value.replaceAll('"', '""')}"`
}

function adminClient(database: string): Client {
  const settings = readTestPostgresSettings()
  return new Client({ ...settings, database, ssl: false })
}

export async function cleanupRemoteResources(): Promise<void> {
  const settings = readTestPostgresSettings()
  const client = adminClient(settings.database)
  await client.connect()
  try {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(remoteResources.database)} WITH (FORCE)`)
    await client.query(`DROP ROLE IF EXISTS ${quoteIdentifier(remoteResources.principal)}`)
  } finally {
    await client.end()
  }
}

export async function seedReadableTable(): Promise<void> {
  const client = adminClient(remoteResources.database)
  await client.connect()
  try {
    await client.query(
      `CREATE TABLE ${quoteIdentifier(remoteResources.table)} (id integer PRIMARY KEY, label text NOT NULL)`,
    )
    await client.query(
      `INSERT INTO ${quoteIdentifier(remoteResources.table)} (id, label) VALUES ($1, $2)`,
      [1, 'visible to the read-only E2E role'],
    )
  } finally {
    await client.end()
  }
}

export async function verifyReadOnlyLogin(oneTimePassword: string): Promise<{
  insertDenied: boolean
  selectedLabel: string | null
}> {
  const settings = readTestPostgresSettings()
  const client = new Client({
    database: remoteResources.database,
    host: settings.host,
    password: oneTimePassword,
    port: settings.port,
    ssl: false,
    user: remoteResources.principal,
  })
  await client.connect()
  try {
    const selected = await client.query<{ label: string }>(
      `SELECT label FROM ${quoteIdentifier(remoteResources.table)} WHERE id = $1`,
      [1],
    )
    let insertDenied = false
    try {
      await client.query(
        `INSERT INTO ${quoteIdentifier(remoteResources.table)} (id, label) VALUES ($1, $2)`,
        [2, 'must not be inserted'],
      )
    } catch (error: unknown) {
      insertDenied =
        typeof error === 'object' && error !== null && 'code' in error && error.code === '42501'
    }

    return { insertDenied, selectedLabel: selected.rows[0]?.label ?? null }
  } finally {
    await client.end()
  }
}

export async function verifyWritableLogin(oneTimePassword: string): Promise<void> {
  const settings = readTestPostgresSettings()
  const client = new Client({
    database: remoteResources.database,
    host: settings.host,
    password: oneTimePassword,
    port: settings.port,
    ssl: false,
    user: remoteResources.principal,
  })
  await client.connect()
  try {
    await client.query(
      `INSERT INTO ${quoteIdentifier(remoteResources.table)} (id, label) VALUES ($1, $2)`,
      [2, 'written through the managed role'],
    )
  } finally {
    await client.end()
  }
}

export async function verifyLoginRejected(oneTimePassword: string): Promise<boolean> {
  const settings = readTestPostgresSettings()
  const client = new Client({
    database: remoteResources.database,
    host: settings.host,
    password: oneTimePassword,
    port: settings.port,
    ssl: false,
    user: remoteResources.principal,
  })
  try {
    await client.connect()
    return false
  } catch (error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error.code === '28P01' || error.code === '28000')
    )
  } finally {
    await client.end().catch(() => undefined)
  }
}

export async function verifySelectAccess(oneTimePassword: string): Promise<boolean> {
  const settings = readTestPostgresSettings()
  const client = new Client({
    database: remoteResources.database,
    host: settings.host,
    password: oneTimePassword,
    port: settings.port,
    ssl: false,
    user: remoteResources.principal,
  })
  await client.connect()
  try {
    await client.query(`SELECT * FROM ${quoteIdentifier(remoteResources.table)}`)
    return true
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '42501') {
      return false
    }
    throw error
  } finally {
    await client.end()
  }
}

export async function readSeededLabels(): Promise<readonly string[]> {
  const client = adminClient(remoteResources.database)
  await client.connect()
  try {
    const result = await client.query<{ label: string }>(
      `SELECT label FROM ${quoteIdentifier(remoteResources.table)} ORDER BY id`,
    )
    return result.rows.map(({ label }) => label)
  } finally {
    await client.end()
  }
}

export async function remoteDatabaseExists(): Promise<boolean> {
  const settings = readTestPostgresSettings()
  const client = adminClient(settings.database)
  await client.connect()
  try {
    const result = await client.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
      [remoteResources.database],
    )
    return result.rows[0]?.exists ?? false
  } finally {
    await client.end()
  }
}
