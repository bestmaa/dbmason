import type { ChangeEventHandler, FormEventHandler, MouseEventHandler } from 'react'

import type { AccessLevel, ConnectionSummary } from '@/modules/database-manager/domain/contracts'

import type { PrincipalRowViewModel } from './principalRows'

export interface PrincipalAccessFormValue {
  database: string
  level: AccessLevel
}

export interface PrincipalManagementModel {
  accessForm: PrincipalAccessFormValue
  canConfirmDrop: boolean
  dropConfirmation: string
  error: string | null
  principal: PrincipalRowViewModel | null
  selectedDatabaseHasPublicConnect: boolean
  submitting: boolean
  warnings: readonly string[]
}

export interface PrincipalManagementActions {
  close: () => void
  manage: MouseEventHandler<HTMLButtonElement>
  onApplyAccess: FormEventHandler<HTMLFormElement>
  onDatabaseChange: ChangeEventHandler<HTMLSelectElement>
  onDrop: FormEventHandler<HTMLFormElement>
  onDropConfirmationChange: ChangeEventHandler<HTMLInputElement>
  onLevelChange: ChangeEventHandler<HTMLSelectElement>
  onRevokeAccess: () => void
  onRotatePassword: () => void
  onToggleLogin: () => void
}

export interface ConnectionRemovalModel {
  canConfirm: boolean
  confirmation: string
  error: string | null
  submitting: boolean
  target: ConnectionSummary | null
}

export interface ConnectionRemovalActions {
  close: () => void
  onConfirmationChange: ChangeEventHandler<HTMLInputElement>
  onSubmit: FormEventHandler<HTMLFormElement>
  open: () => void
}
