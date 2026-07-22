import type { ServerSnapshot } from '@/modules/database-manager/domain/contracts'

import type {
  ConnectionFormValue,
  DatabaseFormValue,
  PrincipalFormValue,
} from '../model/viewModels'

export const initialConnectionForm: ConnectionFormValue = {
  host: 'localhost',
  maintenanceDatabase: 'postgres',
  name: '',
  password: '',
  port: '5432',
  sslMode: 'verify-full',
  username: 'postgres',
}

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
