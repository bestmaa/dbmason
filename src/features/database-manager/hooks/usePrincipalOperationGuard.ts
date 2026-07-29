'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'

import { managerErrorMessage } from './managerHookSupport'

export interface PrincipalOperationContext {
  connectionId: string
  id: number
  principalName: string
}

interface PrincipalTarget {
  managementDisabledReason: string | null
  name: string
}

export function usePrincipalOperationGuard(
  connectionId: string | null,
  principalName: string | null,
) {
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inventoryContext = useRef(0)
  const operationContext = useRef(0)
  const activeConnectionId = useRef(connectionId)
  const activePrincipalName = useRef(principalName)

  useLayoutEffect(() => {
    activeConnectionId.current = connectionId
    activePrincipalName.current = principalName
  }, [connectionId, principalName])

  const isCurrentContext = useCallback(
    (targetConnectionId: string, targetPrincipal: string) =>
      activeConnectionId.current === targetConnectionId &&
      activePrincipalName.current === targetPrincipal,
    [],
  )

  const beginInventory = useCallback(
    (targetConnectionId: string, targetPrincipal: string) =>
      isCurrentContext(targetConnectionId, targetPrincipal)
        ? ++inventoryContext.current
        : null,
    [isCurrentContext],
  )

  const isCurrentInventory = useCallback(
    (id: number, targetConnectionId: string, targetPrincipal: string) =>
      inventoryContext.current === id &&
      isCurrentContext(targetConnectionId, targetPrincipal),
    [isCurrentContext],
  )

  const isCurrentOperation = useCallback(
    (context: PrincipalOperationContext) =>
      operationContext.current === context.id &&
      isCurrentContext(context.connectionId, context.principalName),
    [isCurrentContext],
  )

  const invalidate = useCallback(() => {
    inventoryContext.current += 1
    operationContext.current += 1
    activePrincipalName.current = null
    setError(null)
    setSubmitting(false)
  }, [])

  const selectPrincipal = useCallback((targetPrincipal: string) => {
    activePrincipalName.current = targetPrincipal
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const run = useCallback(
    async (
      canManage: boolean,
      targetConnectionId: string | null,
      principal: PrincipalTarget | null,
      operation: (context: PrincipalOperationContext) => Promise<void>,
    ) => {
      if (
        !canManage ||
        !targetConnectionId ||
        !principal ||
        principal.managementDisabledReason
      ) return
      const context = {
        connectionId: targetConnectionId,
        id: ++operationContext.current,
        principalName: principal.name,
      }
      setSubmitting(true)
      setError(null)
      try {
        await operation(context)
      } catch (operationError: unknown) {
        if (isCurrentOperation(context)) {
          setError(managerErrorMessage(operationError))
        }
      } finally {
        if (operationContext.current === context.id) setSubmitting(false)
      }
    },
    [isCurrentOperation],
  )

  return {
    beginInventory,
    clearError,
    error,
    invalidate,
    isCurrentInventory,
    isCurrentOperation,
    run,
    selectPrincipal,
    submitting,
  }
}
