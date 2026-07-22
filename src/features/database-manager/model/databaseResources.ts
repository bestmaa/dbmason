import type {
  DatabaseSummary,
  EngineId,
  MysqlDatabaseSummary,
  PostgresDatabaseSummary,
} from '@/modules/database-manager/domain/contracts'

export interface DatabaseOption {
  label: string
  value: string
}

interface DatabaseRowBase {
  name: string
  sizeLabel: string
}

export interface MysqlDatabaseRowViewModel extends DatabaseRowBase {
  characterSet: string
  collation: string
}

export interface PostgresDatabaseRowViewModel extends DatabaseRowBase {
  accessLabel: string
  encoding: string
  isBlocked: boolean
  owner: string
  publicPrivileges: readonly string[]
}

export type DatabaseTableViewModel =
  | { engine: 'mysql'; rows: readonly MysqlDatabaseRowViewModel[] }
  | { engine: 'postgresql'; rows: readonly PostgresDatabaseRowViewModel[] }

function formatBytes(value: number | null): string {
  if (value === null) return '—'
  if (value < 1_048_576) return `${Math.round(value / 1024)} KB`
  if (value < 1_073_741_824) return `${(value / 1_048_576).toFixed(1)} MB`
  return `${(value / 1_073_741_824).toFixed(1)} GB`
}

function unreachable(value: never): never {
  throw new Error(`Unsupported database engine: ${String(value)}`)
}

function postgresRow(database: PostgresDatabaseSummary): PostgresDatabaseRowViewModel {
  const publicPrivileges: string[] = []
  if (database.publicConnect) publicPrivileges.push('CONNECT')
  if (database.publicTemporary) publicPrivileges.push('TEMPORARY')
  return {
    accessLabel: database.allowConnections ? 'Connectable' : 'Blocked',
    encoding: database.encoding,
    isBlocked: !database.allowConnections,
    name: database.name,
    owner: database.owner,
    publicPrivileges,
    sizeLabel: formatBytes(database.sizeBytes),
  }
}

function mysqlRow(database: MysqlDatabaseSummary): MysqlDatabaseRowViewModel {
  return {
    characterSet: database.defaultCharacterSet,
    collation: database.defaultCollation,
    name: database.name,
    sizeLabel: formatBytes(database.sizeBytes),
  }
}

export function databaseSearchValues(database: DatabaseSummary): readonly string[] {
  switch (database.engine) {
    case 'mysql':
      return [database.name, database.defaultCharacterSet, database.defaultCollation]
    case 'postgresql':
      return [database.name, database.owner, database.encoding]
    default:
      return unreachable(database)
  }
}

export function databaseIsWorkspaceSelectable(database: DatabaseSummary): boolean {
  switch (database.engine) {
    case 'mysql':
      return true
    case 'postgresql':
      return database.allowConnections
    default:
      return unreachable(database)
  }
}

export function databaseHasPublicConnect(database: DatabaseSummary): boolean {
  switch (database.engine) {
    case 'mysql':
      return false
    case 'postgresql':
      return database.publicConnect
    default:
      return unreachable(database)
  }
}

export function buildDatabaseOptions(
  databases: readonly DatabaseSummary[],
): readonly DatabaseOption[] {
  return databases.map((database) => ({
    label: `${database.name}${databaseHasPublicConnect(database) ? ' (PUBLIC CONNECT)' : ''}`,
    value: database.name,
  }))
}

export function buildDatabaseTableViewModel(
  engine: EngineId,
  databases: readonly DatabaseSummary[],
): DatabaseTableViewModel {
  switch (engine) {
    case 'mysql':
      return {
        engine,
        rows: databases
          .filter((database): database is MysqlDatabaseSummary => database.engine === engine)
          .map(mysqlRow),
      }
    case 'postgresql':
      return {
        engine,
        rows: databases
          .filter((database): database is PostgresDatabaseSummary => database.engine === engine)
          .map(postgresRow),
      }
    default:
      return unreachable(engine)
  }
}
