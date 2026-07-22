import {
  engineIds,
  type EngineId,
  type ServerSnapshot,
} from '@/modules/database-manager/domain/contracts'

import type {
  ConnectionFormValue,
  DatabaseFormValue,
  PrincipalFormValue,
} from '../model/viewModels'

const engineConnectionDefaults: Readonly<
  Record<EngineId, Pick<ConnectionFormValue, 'maintenanceDatabase' | 'port' | 'username'>>
> = {
  mysql: { maintenanceDatabase: 'mysql', port: '3306', username: 'root' },
  postgresql: { maintenanceDatabase: 'postgres', port: '5432', username: 'postgres' },
}

export function connectionFormForEngine(
  engine: EngineId,
  shared: Partial<
    Pick<ConnectionFormValue, 'host' | 'name' | 'password' | 'sslMode'>
  > = {},
): ConnectionFormValue {
  return {
    engine,
    host: shared.host ?? 'localhost',
    name: shared.name ?? '',
    password: shared.password ?? '',
    sslMode: shared.sslMode ?? 'verify-full',
    ...engineConnectionDefaults[engine],
  }
}

export function parseEngineId(value: unknown): EngineId | null {
  return engineIds.find((engine) => engine === value) ?? null
}

export const initialConnectionForm = connectionFormForEngine('postgresql')

export const initialDatabaseForm: DatabaseFormValue = { name: '', owner: '' }
export const initialPrincipalForm: PrincipalFormValue = { database: '', level: 'read', name: '' }

export function managerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

export function summarizeSnapshot(snapshot: ServerSnapshot | null) {
  return {
    databases: snapshot?.databases.length ?? 0,
    loginRoles: snapshot?.principals.filter((item) => item.canLogin).length ?? 0,
    privilegedRoles:
      snapshot?.principals.filter(
        (item) => item.isSuperuser || item.canCreateDatabase || item.canCreateRole,
      ).length ?? 0,
  }
}
