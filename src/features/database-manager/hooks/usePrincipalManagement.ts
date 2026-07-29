'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, MouseEvent } from 'react'

import type { AccessLevel, CreatePrincipalResult, DatabaseSummary } from '@/modules/database-manager/domain/contracts'

import { parseAvailableAccessLevel, preferredAccessLevel } from '../model/accessLevelOptions'
import type {
  PrincipalAccessFormValue,
  PrincipalManagementActions,
  PrincipalManagementModel,
} from '../model/lifecycleViewModels'
import type { PrincipalRowViewModel } from '../model/principalRows'
import { principalLifecycleClient } from '../services/principalLifecycleClient'
import { usePrincipalAccessInventory } from './usePrincipalAccessInventory'
import { usePrincipalOperationGuard } from './usePrincipalOperationGuard'

const initialAccess: PrincipalAccessFormValue = { database: '', level: 'read' }

interface PrincipalManagementInput {
  accessLevels: readonly AccessLevel[]
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
  const preferredLevel = preferredAccessLevel(input.accessLevels)
  const [principalName, setPrincipalName] = useState<string | null>(null)
  const [accessForm, setAccessForm] = useState({
    ...initialAccess,
    level: preferredLevel,
  })
  const [dropConfirmation, setDropConfirmation] = useState('')
  const [warnings, setWarnings] = useState<readonly string[]>([])
  const accessInventory = usePrincipalAccessInventory()
  const resetAccessInventory = accessInventory.reset
  const previousConnectionId = useRef(input.connectionId)
  const operationGuard = usePrincipalOperationGuard(input.connectionId, principalName)
  const invalidateOperation = operationGuard.invalidate
  const principal = input.principals.find((item) => item.name === principalName) ?? null
  const canMutate = input.canManage && principal?.managementDisabledReason === null
  const currentAccess = accessInventory.inventory?.databases.find(
    ({ database }) => database === accessForm.database,
  ) ?? null
  const loadAccessInventory = async (
    connectionId: string,
    targetPrincipal: string,
    selectedDatabaseName: string,
  ) => {
    const requestContext = operationGuard.beginInventory(connectionId, targetPrincipal)
    if (requestContext === null) return
    const inventory = await accessInventory.load(connectionId, targetPrincipal)
    if (
      !inventory ||
      !operationGuard.isCurrentInventory(
        requestContext,
        connectionId,
        targetPrincipal,
      )
    ) return
    const selectedAccess = inventory?.databases.find(
      ({ database }) => database === selectedDatabaseName,
    )
    const level = selectedAccess
      ? parseAvailableAccessLevel(selectedAccess.directPreset, input.accessLevels)
      : null
    setAccessForm((value) =>
      value.database === selectedDatabaseName
        ? { ...value, level: level ?? preferredLevel }
        : value,
    )
  }

  const reset = useCallback(() => {
    invalidateOperation()
    resetAccessInventory()
    setPrincipalName(null)
    setAccessForm({ ...initialAccess, level: preferredLevel })
    setDropConfirmation('')
    setWarnings([])
  }, [invalidateOperation, preferredLevel, resetAccessInventory])

  useEffect(() => {
    if (previousConnectionId.current === input.connectionId) return
    previousConnectionId.current = input.connectionId
    reset()
  }, [input.connectionId, reset])

  const run = (operation: Parameters<typeof operationGuard.run>[3]) =>
    operationGuard.run(input.canManage, input.connectionId, principal, operation)

  const onApplyAccess = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run(async (context) => {
      if (!accessForm.database || !input.accessLevels.includes(accessForm.level)) return
      const nextWarnings = await principalLifecycleClient.setAccess(
        context.connectionId,
        context.principalName,
        accessForm,
      )
      if (!operationGuard.isCurrentOperation(context)) return
      setWarnings(nextWarnings)
      await loadAccessInventory(
        context.connectionId,
        context.principalName,
        accessForm.database,
      )
      if (!operationGuard.isCurrentOperation(context)) return
      input.onRefresh()
    })
  }

  const onDrop = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run(async (context) => {
      if (dropConfirmation !== context.principalName) return
      await principalLifecycleClient.drop(context.connectionId, context.principalName)
      if (!operationGuard.isCurrentOperation(context)) return
      reset()
      input.onRefresh()
    })
  }

  const actions: PrincipalManagementActions = {
    close: () => {
      if (!operationGuard.submitting) reset()
    },
    manage: (event: MouseEvent<HTMLButtonElement>) => {
      const name = event.currentTarget.dataset.principalName
      const target = input.principals.find((item) => item.name === name)
      if (!target) return
      operationGuard.selectPrincipal(target.name)
      setPrincipalName(target.name)
      setAccessForm({
        database: input.databases[0]?.name ?? '',
        level: preferredLevel,
      })
      setDropConfirmation('')
      operationGuard.clearError()
      setWarnings([])
      accessInventory.reset()
      if (input.connectionId) {
        void loadAccessInventory(input.connectionId, target.name, input.databases[0]?.name ?? '')
      }
    },
    onApplyAccess,
    onDatabaseChange: (event: ChangeEvent<HTMLSelectElement>) => {
      const database = event.target.value
      const access = accessInventory.inventory?.databases.find(
        (item) => item.database === database,
      )
      const level = access
        ? parseAvailableAccessLevel(access.directPreset, input.accessLevels)
        : null
      setAccessForm({
        database,
        level: level ?? preferredLevel,
      })
    },
    onDrop,
    onDropConfirmationChange: (event: ChangeEvent<HTMLInputElement>) =>
      setDropConfirmation(event.target.value),
    onLevelChange: (event: ChangeEvent<HTMLSelectElement>) => {
      const level = parseAvailableAccessLevel(event.target.value, input.accessLevels)
      if (level) setAccessForm((value) => ({ ...value, level }))
    },
    onRevokeAccess: () => {
      void run(async (context) => {
        if (!accessForm.database) return
        const nextWarnings = await principalLifecycleClient.revokeAccess(
          context.connectionId,
          context.principalName,
          accessForm.database,
        )
        if (!operationGuard.isCurrentOperation(context)) return
        setWarnings(nextWarnings)
        await loadAccessInventory(
          context.connectionId,
          context.principalName,
          accessForm.database,
        )
        if (!operationGuard.isCurrentOperation(context)) return
        input.onRefresh()
      })
    },
    onRotatePassword: () => {
      void run(async (context) => {
        const credential = await principalLifecycleClient.rotatePassword(
          context.connectionId,
          context.principalName,
        )
        if (!operationGuard.isCurrentOperation(context)) return
        reset()
        input.onCredential({ ...credential, warnings: [] })
      })
    },
    onToggleLogin: () => {
      if (!principal) return
      const enabled = !principal.canLogin
      void run(async (context) => {
        await principalLifecycleClient.setLogin(
          context.connectionId,
          context.principalName,
          enabled,
        )
        if (!operationGuard.isCurrentOperation(context)) return
        setWarnings([])
        input.onRefresh()
      })
    },
  }

  return {
    actions,
    model: {
      accessForm,
      accessInventory: accessInventory.inventory?.databases ?? [],
      accessInventoryError: accessInventory.error,
      accessInventoryLoading: accessInventory.loading,
      accessInventoryObservedAt: accessInventory.inventory?.observedAt ?? null,
      accessInventoryTruncated: accessInventory.inventory?.truncated ?? false,
      canMutate,
      canConfirmDrop: Boolean(principal && dropConfirmation === principal.name),
      canRevokeCurrentAccess:
        currentAccess !== null &&
        currentAccess.directPreset !== 'none' &&
        currentAccess.directPreset !== 'unknown',
      currentAccess,
      dropConfirmation,
      error: operationGuard.error,
      principal,
      submitting: operationGuard.submitting,
      warnings,
    },
  }
}
