'use client'

import { useState } from 'react'
import type { ChangeEvent, FormEvent, MouseEvent } from 'react'

import type {
  CreatePrincipalResult,
  DatabaseSummary,
} from '@/modules/database-manager/domain/contracts'

import type {
  PrincipalManagementActions,
  PrincipalManagementModel,
  PrincipalAccessFormValue,
} from '../model/lifecycleViewModels'
import type { PrincipalRowViewModel } from '../model/principalRows'
import { principalLifecycleClient } from '../services/principalLifecycleClient'
import { managerErrorMessage } from './managerHookSupport'

const initialAccess: PrincipalAccessFormValue = { database: '', level: 'read' }

interface PrincipalManagementInput {
  canManage: boolean
  connectionId: string | null
  databases: readonly DatabaseSummary[]
  onCredential: (credential: CreatePrincipalResult) => void
  onRefresh: () => void
  principals: readonly PrincipalRowViewModel[]
}

interface PrincipalManagementState {
  actions: PrincipalManagementActions
  model: PrincipalManagementModel
}

export function usePrincipalManagement(input: PrincipalManagementInput): PrincipalManagementState {
  const [principalName, setPrincipalName] = useState<string | null>(null)
  const [accessForm, setAccessForm] = useState(initialAccess)
  const [dropConfirmation, setDropConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [warnings, setWarnings] = useState<readonly string[]>([])
  const principal = input.principals.find((item) => item.name === principalName) ?? null
  const selectedDatabase =
    input.databases.find((database) => database.name === accessForm.database) ?? null

  const reset = () => {
    setPrincipalName(null)
    setAccessForm(initialAccess)
    setDropConfirmation('')
    setError(null)
    setWarnings([])
  }

  const run = async (operation: () => Promise<void>) => {
    if (!input.canManage || !input.connectionId || !principal || principal.managementDisabledReason) return
    setSubmitting(true)
    setError(null)
    try {
      await operation()
    } catch (operationError: unknown) {
      setError(managerErrorMessage(operationError))
    } finally {
      setSubmitting(false)
    }
  }

  const onApplyAccess = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run(async () => {
      if (!input.connectionId || !principal || !accessForm.database) return
      const nextWarnings = await principalLifecycleClient.setAccess(
        input.connectionId,
        principal.name,
        accessForm,
      )
      setWarnings(nextWarnings)
      input.onRefresh()
    })
  }

  const onDrop = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run(async () => {
      if (!input.connectionId || !principal || dropConfirmation !== principal.name) return
      await principalLifecycleClient.drop(input.connectionId, principal.name)
      reset()
      input.onRefresh()
    })
  }

  const actions: PrincipalManagementActions = {
    close: () => {
      if (!submitting) reset()
    },
    manage: (event: MouseEvent<HTMLButtonElement>) => {
      const name = event.currentTarget.dataset.principalName
      const target = input.principals.find((item) => item.name === name)
      if (!input.canManage || !target || target.managementDisabledReason) return
      setPrincipalName(target.name)
      setAccessForm({ database: input.databases[0]?.name ?? '', level: 'read' })
      setDropConfirmation('')
      setError(null)
      setWarnings([])
    },
    onApplyAccess,
    onDatabaseChange: (event: ChangeEvent<HTMLSelectElement>) =>
      setAccessForm((value) => ({ ...value, database: event.target.value })),
    onDrop,
    onDropConfirmationChange: (event: ChangeEvent<HTMLInputElement>) =>
      setDropConfirmation(event.target.value),
    onLevelChange: (event: ChangeEvent<HTMLSelectElement>) =>
      setAccessForm((value) => ({ ...value, level: event.target.value as typeof value.level })),
    onRevokeAccess: () => {
      void run(async () => {
        if (!input.connectionId || !principal || !accessForm.database) return
        const nextWarnings = await principalLifecycleClient.revokeAccess(
          input.connectionId,
          principal.name,
          accessForm.database,
        )
        setWarnings(nextWarnings)
        input.onRefresh()
      })
    },
    onRotatePassword: () => {
      void run(async () => {
        if (!input.connectionId || !principal) return
        const credential = await principalLifecycleClient.rotatePassword(
          input.connectionId,
          principal.name,
        )
        reset()
        input.onCredential({ ...credential, warnings: [] })
      })
    },
    onToggleLogin: () => {
      void run(async () => {
        if (!input.connectionId || !principal) return
        await principalLifecycleClient.setLogin(input.connectionId, principal.name, !principal.canLogin)
        setWarnings([])
        input.onRefresh()
      })
    },
  }

  return {
    actions,
    model: {
      accessForm,
      canConfirmDrop: Boolean(principal && dropConfirmation === principal.name),
      dropConfirmation,
      error,
      principal,
      selectedDatabase,
      submitting,
      warnings,
    },
  }
}
