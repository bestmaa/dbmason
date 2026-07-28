'use client'

import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

import type { ConnectionSummary } from '@/modules/database-manager/domain/contracts'

import type {
  ConnectionRemovalActions,
  ConnectionRemovalModel,
} from '../model/lifecycleViewModels'
import { connectionLifecycleClient } from '../services/connectionLifecycleClient'
import { managerErrorMessage } from './managerHookSupport'

interface ConnectionRemovalInput {
  canDelete: boolean
  connections: readonly ConnectionSummary[]
  onRemoved: (connectionId: string) => void
  selectedConnection: ConnectionSummary | null
}

interface ConnectionRemovalState {
  actions: ConnectionRemovalActions
  model: ConnectionRemovalModel
}

export function useConnectionRemoval(input: ConnectionRemovalInput): ConnectionRemovalState {
  const [target, setTarget] = useState<ConnectionSummary | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const open = (connection: ConnectionSummary | null) => {
    if (!input.canDelete || !connection) return
    setConfirmation('')
    setError(null)
    setTarget(connection)
  }

  const close = () => {
    if (submitting) return
    setTarget(null)
    setConfirmation('')
    setError(null)
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!input.canDelete || !target || confirmation !== target.name) return
    setSubmitting(true)
    setError(null)
    try {
      await connectionLifecycleClient.removeSaved(target.id)
      const removedId = target.id
      setTarget(null)
      setConfirmation('')
      input.onRemoved(removedId)
    } catch (submitError: unknown) {
      setError(managerErrorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return {
    actions: {
      close,
      onConfirmationChange: (event: ChangeEvent<HTMLInputElement>) =>
        setConfirmation(event.target.value),
      onSubmit,
      openSelected: () => open(input.selectedConnection),
      openTarget: (event) => {
        const connection = input.connections.find(
          (item) => item.id === event.currentTarget.dataset.connectionId,
        )
        open(connection ?? null)
      },
    },
    model: {
      canConfirm: Boolean(target && confirmation === target.name),
      confirmation,
      error,
      submitting,
      target,
    },
  }
}
