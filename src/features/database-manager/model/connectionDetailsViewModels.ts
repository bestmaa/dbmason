import type { ChangeEventHandler, FormEventHandler, MouseEventHandler } from 'react'

import type { EngineId, SslMode } from '@/modules/database-manager/domain/contracts'

import type { ConnectionEndpoint, ConnectionPrincipalOption } from './connectionDetails'

export interface ConnectionDetailsModel {
  canEditExternal: boolean
  connectionName: string
  copied: string
  database: string
  engine: EngineId
  error: string
  external: ConnectionEndpoint | null
  externalTemplate: string
  externalForm: {
    host: string
    port: string
    sslMode: SslMode
  }
  internal: ConnectionEndpoint
  internalTemplate: string
  open: boolean
  password: string
  principalOptions: readonly ConnectionPrincipalOption[]
  selectedPrincipal: string
  submitting: boolean
}

export interface ConnectionDetailsActions {
  clearExternal: () => void
  close: () => void
  copyExternal: () => void
  copyExternalTemplate: () => void
  copyInternal: () => void
  copyInternalTemplate: () => void
  onExternalHostChange: ChangeEventHandler<HTMLInputElement>
  onExternalPortChange: ChangeEventHandler<HTMLInputElement>
  onExternalSslModeChange: ChangeEventHandler<HTMLSelectElement>
  onPasswordChange: ChangeEventHandler<HTMLInputElement>
  onPrincipalChange: ChangeEventHandler<HTMLSelectElement>
  openDatabase: MouseEventHandler<HTMLButtonElement>
  saveExternal: FormEventHandler<HTMLFormElement>
}
