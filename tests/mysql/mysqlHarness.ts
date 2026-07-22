import { createConnection } from 'mysql2/promise'
import type { Connection } from 'mysql2/promise'

import type { DatabaseConnectionConfig } from '@/modules/database-manager/domain/contracts'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for the MySQL integration harness`)
  return value
}

export function mysqlTestConfig(): DatabaseConnectionConfig {
  return {
    database: required('MYSQL_TEST_DATABASE'),
    host: process.env.MYSQL_TEST_HOST ?? '127.0.0.1',
    password: required('MYSQL_TEST_PASSWORD'),
    port: Number(process.env.MYSQL_TEST_PORT ?? '53306'),
    sslMode: 'disable',
    username: process.env.MYSQL_TEST_USER ?? 'root',
  }
}

export function mysqlAdmin(): Promise<Connection> {
  const config = mysqlTestConfig()
  return createConnection({
    database: config.database,
    host: config.host,
    multipleStatements: false,
    password: config.password,
    port: config.port,
    user: config.username,
  })
}

export async function dropMysqlResources(
  databases: readonly string[],
  accounts: readonly string[],
  roles: readonly string[] = [],
): Promise<void> {
  const connection = await mysqlAdmin()
  try {
    for (const database of databases) await connection.query(`DROP DATABASE IF EXISTS \`${database}\``)
    for (const account of accounts) {
      const [user, host] = account.split('@')
      if (!user || !host) throw new Error('Test account must use user@host')
      await connection.query(`DROP USER IF EXISTS '${user}'@'${host}'`)
    }
    for (const role of roles) await connection.query(`DROP ROLE IF EXISTS '${role}'@'%'`)
  } finally {
    await connection.end()
  }
}
