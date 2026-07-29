import type { RowDataPacket } from 'mysql2/promise'

import type {
  AccessPresetMatch,
  AccessSource,
  DatabaseConnectionConfig,
  PrincipalAccessInventory,
  PrincipalDatabaseAccess,
} from '../../domain/contracts'
import { ManagerError } from '../../domain/errors'
import { parseMysqlAccount } from './identifiers'
import { withMysqlConnection } from './mysqlClient'
import { mysqlBoolean } from './mysqlValues'
import { mysqlInventoryOperationLimiter } from './operationLimiter'
import {
  hasUnescapedMysqlWildcard,
  mysqlGrantPatternMatches,
} from './mysqlPrivilegeScope'

const maximumInspectedDatabases = 128
const maximumInspectedDatabaseGrantRows = 256
const readPrivileges = ['SELECT', 'SHOW VIEW'] as const
const writePrivileges = ['DELETE', 'INSERT', 'SELECT', 'SHOW VIEW', 'UPDATE'] as const
const developerPrivileges = [
  'ALTER',
  'ALTER ROUTINE',
  'CREATE',
  'CREATE ROUTINE',
  'CREATE TEMPORARY TABLES',
  'CREATE VIEW',
  'DELETE',
  'DROP',
  'EVENT',
  'EXECUTE',
  'INDEX',
  'INSERT',
  'LOCK TABLES',
  'REFERENCES',
  'SELECT',
  'SHOW VIEW',
  'TRIGGER',
  'UPDATE',
] as const

interface AccountContextRow extends RowDataPacket {
  activateAllRoles: unknown
  hasDefaultRole: unknown
  hasGlobalGrant: unknown
  hasGrantedRole: unknown
  hasProxyGrant: unknown
  mandatoryRoles: unknown
  partialRevokes: unknown
}

interface DatabaseRow extends RowDataPacket {
  databaseName: string
}

interface DatabaseGrantRow extends RowDataPacket {
  alterPrivilege: unknown
  alterRoutinePrivilege: unknown
  createPrivilege: unknown
  createRoutinePrivilege: unknown
  createTemporaryTablesPrivilege: unknown
  createViewPrivilege: unknown
  databasePattern: string
  deletePrivilege: unknown
  dropPrivilege: unknown
  eventPrivilege: unknown
  executePrivilege: unknown
  grantPrivilege: unknown
  indexPrivilege: unknown
  insertPrivilege: unknown
  lockTablesPrivilege: unknown
  referencesPrivilege: unknown
  selectPrivilege: unknown
  showViewPrivilege: unknown
  triggerPrivilege: unknown
  updatePrivilege: unknown
}

interface CustomGrantRow extends RowDataPacket {
  databaseName: string
}

const databasePrivilegeFields = [
  ['ALTER', 'alterPrivilege'],
  ['ALTER ROUTINE', 'alterRoutinePrivilege'],
  ['CREATE', 'createPrivilege'],
  ['CREATE ROUTINE', 'createRoutinePrivilege'],
  ['CREATE TEMPORARY TABLES', 'createTemporaryTablesPrivilege'],
  ['CREATE VIEW', 'createViewPrivilege'],
  ['DELETE', 'deletePrivilege'],
  ['DROP', 'dropPrivilege'],
  ['EVENT', 'eventPrivilege'],
  ['EXECUTE', 'executePrivilege'],
  ['INDEX', 'indexPrivilege'],
  ['INSERT', 'insertPrivilege'],
  ['LOCK TABLES', 'lockTablesPrivilege'],
  ['REFERENCES', 'referencesPrivilege'],
  ['SELECT', 'selectPrivilege'],
  ['SHOW VIEW', 'showViewPrivilege'],
  ['TRIGGER', 'triggerPrivilege'],
  ['UPDATE', 'updatePrivilege'],
] as const satisfies readonly (readonly [string, keyof DatabaseGrantRow])[]

function samePrivileges(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index])
}

function mysqlPrivilegeEnabled(value: unknown): boolean {
  return value === 'Y' || mysqlBoolean(value)
}

function privilegesFromDatabaseGrant(row: DatabaseGrantRow): readonly string[] {
  return databasePrivilegeFields
    .filter(([, field]) => mysqlPrivilegeEnabled(row[field]))
    .map(([privilege]) => privilege)
}

function addPrivileges(
  privilegesByDatabase: Map<string, string[]>,
  database: string,
  privileges: readonly string[],
): void {
  const current = privilegesByDatabase.get(database) ?? []
  privilegesByDatabase.set(database, [...current, ...privileges])
}

function addSource(sources: AccessSource[], source: AccessSource, enabled: boolean): void {
  if (enabled && !sources.includes(source)) sources.push(source)
}

export function classifyMysqlDirectAccess(
  privileges: readonly string[],
  hasCustomGrant: boolean,
  hasGrantOption: boolean,
): AccessPresetMatch {
  if (hasCustomGrant || hasGrantOption) return 'custom'
  const normalized = [...new Set(privileges.map((value) => value.toUpperCase()))].sort()
  if (normalized.length === 0) return 'none'
  if (samePrivileges(normalized, readPrivileges)) return 'read'
  if (samePrivileges(normalized, writePrivileges)) return 'write'
  if (samePrivileges(normalized, developerPrivileges)) return 'developer'
  return 'custom'
}

async function loadMysqlPrincipalAccess(
  config: DatabaseConnectionConfig,
  principal: string,
): Promise<PrincipalAccessInventory> {
  const account = parseMysqlAccount(principal)
  return withMysqlConnection(config, config.database, async (connection) => {
    const targetGrantee = `'${account.user}'@'${account.host}'`
    const [databaseRows] = await connection.query<DatabaseRow[]>(
      `SELECT schema_info.SCHEMA_NAME AS databaseName
      FROM information_schema.SCHEMATA schema_info
      ORDER BY schema_info.SCHEMA_NAME
      LIMIT ${maximumInspectedDatabases + 1}`,
    )
    const [contextRows] = await connection.query<AccountContextRow[]>(
      `SELECT
        @@activate_all_roles_on_login AS activateAllRoles,
        @@mandatory_roles AS mandatoryRoles,
        @@partial_revokes AS partialRevokes,
        EXISTS (
          SELECT 1 FROM information_schema.USER_PRIVILEGES privilege
          WHERE privilege.GRANTEE = ? AND (
            privilege.PRIVILEGE_TYPE <> 'USAGE' OR privilege.IS_GRANTABLE = 'YES'
          )
        ) AS hasGlobalGrant,
        EXISTS (
          SELECT 1 FROM mysql.role_edges edge
          WHERE edge.TO_USER = user.User AND edge.TO_HOST = user.Host
        ) AS hasGrantedRole,
        EXISTS (
          SELECT 1 FROM mysql.default_roles role
          WHERE role.USER = user.User AND role.HOST = user.Host
        ) AS hasDefaultRole,
        EXISTS (
          SELECT 1 FROM mysql.proxies_priv proxy
          WHERE proxy.User = user.User AND proxy.Host = user.Host
        ) AS hasProxyGrant
      FROM mysql.user user
      WHERE user.User = ? AND user.Host = ?`,
      [targetGrantee, account.user, account.host],
    )
    const context = contextRows[0]
    if (!context) {
      throw new ManagerError('PRINCIPAL_NOT_FOUND', 'The MySQL account does not exist.', 404)
    }

    const inspectedDatabaseNames = databaseRows
      .slice(0, maximumInspectedDatabases)
      .map(({ databaseName }) => databaseName)
    const inspectedDatabases = new Set(inspectedDatabaseNames)
    const placeholders =
      inspectedDatabaseNames.length > 0
        ? inspectedDatabaseNames.map(() => '?').join(', ')
        : 'NULL'
    const [databaseGrants] = await connection.query<DatabaseGrantRow[]>(
      `SELECT
        privilege.Db AS databasePattern,
        privilege.Alter_priv AS alterPrivilege,
        privilege.Alter_routine_priv AS alterRoutinePrivilege,
        privilege.Create_priv AS createPrivilege,
        privilege.Create_routine_priv AS createRoutinePrivilege,
        privilege.Create_tmp_table_priv AS createTemporaryTablesPrivilege,
        privilege.Create_view_priv AS createViewPrivilege,
        privilege.Delete_priv AS deletePrivilege,
        privilege.Drop_priv AS dropPrivilege,
        privilege.Event_priv AS eventPrivilege,
        privilege.Execute_priv AS executePrivilege,
        privilege.Grant_priv AS grantPrivilege,
        privilege.Index_priv AS indexPrivilege,
        privilege.Insert_priv AS insertPrivilege,
        privilege.Lock_tables_priv AS lockTablesPrivilege,
        privilege.References_priv AS referencesPrivilege,
        privilege.Select_priv AS selectPrivilege,
        privilege.Show_view_priv AS showViewPrivilege,
        privilege.Trigger_priv AS triggerPrivilege,
        privilege.Update_priv AS updatePrivilege
      FROM mysql.db privilege
      WHERE privilege.User = ? AND privilege.Host = ?
      ORDER BY privilege.Db
      LIMIT ${maximumInspectedDatabaseGrantRows + 1}`,
      [account.user, account.host],
    )
    const [customRows] = await connection.query<CustomGrantRow[]>(
      `SELECT DISTINCT privilege.TABLE_SCHEMA AS databaseName
      FROM information_schema.TABLE_PRIVILEGES privilege
      WHERE privilege.GRANTEE = ? AND privilege.TABLE_SCHEMA IN (${placeholders})
      UNION
      SELECT DISTINCT privilege.TABLE_SCHEMA AS databaseName
      FROM information_schema.COLUMN_PRIVILEGES privilege
      WHERE privilege.GRANTEE = ? AND privilege.TABLE_SCHEMA IN (${placeholders})
      UNION
      SELECT DISTINCT privilege.Db AS databaseName
      FROM mysql.procs_priv privilege
      WHERE privilege.User = ? AND privilege.Host = ?
        AND privilege.Db IN (${placeholders}) AND privilege.Proc_priv <> ''`,
      [
        targetGrantee,
        ...inspectedDatabaseNames,
        targetGrantee,
        ...inspectedDatabaseNames,
        account.user,
        account.host,
        ...inspectedDatabaseNames,
      ],
    )

    const partialRevokes = mysqlBoolean(context.partialRevokes)
    const privilegesByDatabase = new Map<string, string[]>()
    const grantOptionDatabases = new Set<string>()
    const wildcardDatabases = new Set<string>()
    for (const grant of databaseGrants) {
      const wildcard = !partialRevokes && hasUnescapedMysqlWildcard(grant.databasePattern)
      const matchingDatabases = inspectedDatabaseNames.filter((databaseName) =>
        partialRevokes
          ? databaseName === grant.databasePattern
          : mysqlGrantPatternMatches(grant.databasePattern, databaseName),
      )
      for (const databaseName of matchingDatabases) {
        addPrivileges(
          privilegesByDatabase,
          databaseName,
          privilegesFromDatabaseGrant(grant),
        )
        if (wildcard) wildcardDatabases.add(databaseName)
        if (mysqlPrivilegeEnabled(grant.grantPrivilege)) {
          grantOptionDatabases.add(databaseName)
        }
      }
    }
    const customGrantDatabases = new Set(
      customRows
        .map(({ databaseName }) => databaseName)
        .filter((databaseName) => inspectedDatabases.has(databaseName)),
    )

    const hasGlobalGrant = mysqlBoolean(context.hasGlobalGrant)
    const hasGrantedRole = mysqlBoolean(context.hasGrantedRole)
    const hasActiveRole =
      mysqlBoolean(context.hasDefaultRole) ||
      (hasGrantedRole && mysqlBoolean(context.activateAllRoles)) ||
      String(context.mandatoryRoles ?? '').trim().length > 0
    const hasProxyGrant = mysqlBoolean(context.hasProxyGrant)
    const databaseGrantRowsTruncated =
      databaseGrants.length > maximumInspectedDatabaseGrantRows
    const databases: PrincipalDatabaseAccess[] = databaseRows.map(({ databaseName }, index) => {
      if (index >= maximumInspectedDatabases || databaseGrantRowsTruncated) {
        const sources: AccessSource[] = []
        addSource(sources, 'global', hasGlobalGrant)
        addSource(sources, 'inherited', hasActiveRole)
        addSource(sources, 'role-switch', hasGrantedRole)
        addSource(sources, 'proxy', hasProxyGrant)
        return {
          database: databaseName,
          directPreset: 'unknown',
          effectivePreset: 'unknown',
          potentialPreset: 'unknown',
          sources,
        }
      }
      const directPreset = hasGlobalGrant
        ? 'custom'
        : classifyMysqlDirectAccess(
          privilegesByDatabase.get(databaseName) ?? [],
          customGrantDatabases.has(databaseName) || wildcardDatabases.has(databaseName),
          grantOptionDatabases.has(databaseName),
        )
      const effectivePreset = hasActiveRole ? 'unknown' : directPreset
      const potentialPreset = hasGrantedRole || hasProxyGrant ? 'unknown' : effectivePreset
      const sources: AccessSource[] = []
      addSource(sources, 'direct', directPreset !== 'none' && !hasGlobalGrant)
      addSource(sources, 'global', hasGlobalGrant)
      addSource(sources, 'inherited', hasActiveRole)
      addSource(sources, 'role-switch', hasGrantedRole)
      addSource(sources, 'proxy', hasProxyGrant)
      return {
        database: databaseName,
        directPreset,
        effectivePreset,
        potentialPreset,
        sources,
      }
    })

    return {
      databases,
      observedAt: new Date().toISOString(),
      principal,
      truncated:
        databaseRows.length > maximumInspectedDatabases ||
        databaseGrantRowsTruncated,
    }
  })
}

export async function getMysqlPrincipalAccess(
  config: DatabaseConnectionConfig,
  principal: string,
): Promise<PrincipalAccessInventory> {
  const release = await mysqlInventoryOperationLimiter.acquire()
  try {
    return await loadMysqlPrincipalAccess(config, principal)
  } finally {
    release()
  }
}
