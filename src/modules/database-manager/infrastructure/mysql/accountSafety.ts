import type { Connection, RowDataPacket } from 'mysql2/promise'

import { ManagerError } from '../../domain/errors'
import type { MysqlAccount } from './identifiers'
import { isMysqlSystemSchema, parseMysqlAccount } from './identifiers'
import { mysqlBoolean } from './mysqlValues'

interface AccountSafetyRow extends RowDataPacket {
  accountLocked: unknown
  hasGlobalPrivilege: unknown
  hasGrantOption: unknown
  hasProxyEdge: unknown
  hasRoleEdge: unknown
  isCurrentAccount: unknown
  isSystemAccount: unknown
  passwordExpired: unknown
}

interface DangerousSchemaPrivilegeRow extends RowDataPacket {
  unsafe: unknown
}

function grantee(account: MysqlAccount): string {
  return `'${account.user}'@'${account.host}'`
}

export async function assertSafeMysqlAccount(
  connection: Connection,
  principal: string,
  options: { database?: string; workspace?: boolean } = {},
): Promise<MysqlAccount> {
  const account = parseMysqlAccount(principal)
  const [rows] = await connection.query<AccountSafetyRow[]>(
    `SELECT
      user.account_locked = 'Y' AS accountLocked,
      user.password_expired = 'Y' AS passwordExpired,
      CONCAT(user.User, '@', user.Host) = CURRENT_USER() AS isCurrentAccount,
      user.User = '' OR user.User LIKE 'mysql.%' AS isSystemAccount,
      EXISTS (
        SELECT 1 FROM information_schema.USER_PRIVILEGES privilege
        WHERE privilege.GRANTEE = ? AND privilege.PRIVILEGE_TYPE <> 'USAGE'
      ) AS hasGlobalPrivilege,
      EXISTS (
        SELECT 1 FROM information_schema.SCHEMA_PRIVILEGES privilege
        WHERE privilege.GRANTEE = ? AND privilege.IS_GRANTABLE = 'YES'
        UNION ALL
        SELECT 1 FROM information_schema.TABLE_PRIVILEGES privilege
        WHERE privilege.GRANTEE = ? AND privilege.IS_GRANTABLE = 'YES'
        UNION ALL
        SELECT 1 FROM information_schema.COLUMN_PRIVILEGES privilege
        WHERE privilege.GRANTEE = ? AND privilege.IS_GRANTABLE = 'YES'
        UNION ALL
        SELECT 1 FROM mysql.procs_priv privilege
        WHERE privilege.User = user.User AND privilege.Host = user.Host
          AND FIND_IN_SET('Grant', privilege.Proc_priv) > 0
      ) AS hasGrantOption,
      EXISTS (
        SELECT 1 FROM mysql.role_edges edge
        WHERE (edge.TO_USER = user.User AND edge.TO_HOST = user.Host)
           OR (edge.FROM_USER = user.User AND edge.FROM_HOST = user.Host)
      ) AS hasRoleEdge,
      EXISTS (
        SELECT 1 FROM mysql.proxies_priv proxy
        WHERE (proxy.User = user.User AND proxy.Host = user.Host)
           OR (proxy.Proxied_user = user.User AND proxy.Proxied_host = user.Host)
      ) AS hasProxyEdge
    FROM mysql.user user
    WHERE user.User = ? AND user.Host = ?`,
    [
      grantee(account),
      grantee(account),
      grantee(account),
      grantee(account),
      account.user,
      account.host,
    ],
  )
  const row = rows[0]
  if (!row) throw new ManagerError('PRINCIPAL_NOT_FOUND', 'The MySQL account does not exist.', 404)
  if (
    mysqlBoolean(row.isCurrentAccount) ||
    mysqlBoolean(row.isSystemAccount) ||
    mysqlBoolean(row.hasGlobalPrivilege) ||
    mysqlBoolean(row.hasGrantOption) ||
    mysqlBoolean(row.hasProxyEdge) ||
    mysqlBoolean(row.hasRoleEdge)
  ) {
    throw new ManagerError(
      options.workspace ? 'QUERY_PRINCIPAL_UNSAFE' : 'PRINCIPAL_PROTECTED',
      'Current, system, globally privileged, grant-capable, role-linked, or proxy-linked MySQL accounts are protected.',
      409,
    )
  }
  if (options.workspace && (mysqlBoolean(row.accountLocked) || mysqlBoolean(row.passwordExpired))) {
    throw new ManagerError(
      'QUERY_PRINCIPAL_NOLOGIN',
      'Choose an unlocked MySQL account with a current password.',
      409,
    )
  }
  if (options.workspace && options.database) {
    if (isMysqlSystemSchema(options.database)) {
      throw new ManagerError(
        'QUERY_DATABASE_PROTECTED',
        'The MySQL workspace cannot open a system schema.',
        409,
      )
    }
    const [privileges] = await connection.query<DangerousSchemaPrivilegeRow[]>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.SCHEMA_PRIVILEGES privilege
        WHERE privilege.GRANTEE = ?
          AND privilege.PRIVILEGE_TYPE IN (
            'ALTER', 'ALTER ROUTINE', 'CREATE', 'CREATE ROUTINE', 'CREATE VIEW',
            'CREATE TEMPORARY TABLES', 'DROP', 'EVENT', 'EXECUTE',
            'INDEX', 'LOCK TABLES', 'REFERENCES', 'TRIGGER'
          )
        UNION ALL
        SELECT 1 FROM information_schema.TABLE_PRIVILEGES privilege
        WHERE privilege.GRANTEE = ?
          AND privilege.PRIVILEGE_TYPE IN (
            'ALTER', 'CREATE', 'CREATE VIEW', 'DROP', 'INDEX', 'REFERENCES', 'TRIGGER'
          )
        UNION ALL
        SELECT 1 FROM information_schema.COLUMN_PRIVILEGES privilege
        WHERE privilege.GRANTEE = ? AND privilege.PRIVILEGE_TYPE = 'REFERENCES'
        UNION ALL
        SELECT 1 FROM mysql.procs_priv privilege
        WHERE privilege.User = ? AND privilege.Host = ? AND privilege.Proc_priv <> ''
      ) AS unsafe`,
      [
        grantee(account),
        grantee(account),
        grantee(account),
        account.user,
        account.host,
      ],
    )
    if (mysqlBoolean(privileges[0]?.unsafe)) {
      throw new ManagerError(
        'QUERY_PRINCIPAL_UNSAFE',
        'Accounts with DDL, routine, trigger, event, temporary-table, or lock privileges cannot use the workspace.',
        409,
      )
    }
  }
  return account
}
