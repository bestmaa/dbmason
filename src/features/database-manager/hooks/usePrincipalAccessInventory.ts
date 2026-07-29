'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { PrincipalAccessInventory } from '@/modules/database-manager/domain/contracts'

import { principalLifecycleClient } from '../services/principalLifecycleClient'
import { managerErrorMessage } from './managerHookSupport'

export function usePrincipalAccessInventory() {
  const [inventory, setInventory] = useState<PrincipalAccessInventory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  const reset = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    setInventory(null)
    setError(null)
    setLoading(false)
  }, [])

  const load = useCallback(
    async (
      connectionId: string,
      principal: string,
    ): Promise<PrincipalAccessInventory | null> => {
      controller.current?.abort()
      const requestController = new AbortController()
      controller.current = requestController
      setLoading(true)
      setError(null)
      try {
        const result = await principalLifecycleClient.getAccess(
          connectionId,
          principal,
          requestController.signal,
        )
        if (requestController.signal.aborted) return null
        setInventory(result)
        return result
      } catch (loadError: unknown) {
        if (!requestController.signal.aborted) {
          setInventory(null)
          setError(managerErrorMessage(loadError))
        }
        return null
      } finally {
        if (!requestController.signal.aborted) setLoading(false)
      }
    },
    [],
  )

  return { error, inventory, load, loading, reset }
}
