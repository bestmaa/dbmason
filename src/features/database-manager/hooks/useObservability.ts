'use client'

import { useEffect, useState } from 'react'

import type { ObservabilitySnapshot } from '@/modules/database-manager/domain/observability'

import {
  buildObservabilityPanelModel,
  type ObservabilityPanelActions,
  type ObservabilityPanelModel,
} from '../model/observabilityViewModels'
import { observabilityClient } from '../services/observabilityClient'
import { managerErrorMessage } from './managerHookSupport'

interface UseObservabilityInput {
  connectionId: string | null
  enabled: boolean
}

interface ObservabilityRequestState {
  connectionId: string | null
  error: string | null
  requestKey: string | null
  snapshot: ObservabilitySnapshot | null
}

interface UseObservabilityState {
  actions: ObservabilityPanelActions
  model: ObservabilityPanelModel
}

const initialState: ObservabilityRequestState = {
  connectionId: null,
  error: null,
  requestKey: null,
  snapshot: null,
}

export function useObservability(input: UseObservabilityInput): UseObservabilityState {
  const [request, setRequest] = useState(initialState)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!input.enabled || !input.connectionId) return
    const connectionId = input.connectionId
    const requestKey = `${connectionId}:${refreshKey}`
    const controller = new AbortController()

    observabilityClient
      .getSnapshot(connectionId, controller.signal)
      .then((snapshot) => {
        if (!controller.signal.aborted) {
          setRequest({ connectionId, error: null, requestKey, snapshot })
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setRequest((current) => ({
            connectionId,
            error: managerErrorMessage(error),
            requestKey,
            snapshot: current.connectionId === connectionId ? current.snapshot : null,
          }))
        }
      })

    return () => controller.abort()
  }, [input.connectionId, input.enabled, refreshKey])

  const requestKey = input.connectionId ? `${input.connectionId}:${refreshKey}` : null
  const sameConnection = request.connectionId === input.connectionId
  const visibleRequest =
    {
      error: request.requestKey === requestKey ? request.error : null,
      pending: Boolean(input.enabled && input.connectionId && request.requestKey !== requestKey),
      snapshot: sameConnection ? request.snapshot : null,
    }

  return {
    actions: {
      refresh: () => {
        if (input.enabled && input.connectionId) setRefreshKey((value) => value + 1)
      },
    },
    model: buildObservabilityPanelModel(visibleRequest),
  }
}
