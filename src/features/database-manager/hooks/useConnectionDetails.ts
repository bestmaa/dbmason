'use client'

import { type ChangeEvent, type FormEvent, useMemo, useState } from 'react'

import type {
  ConnectionSummary,
  PrincipalSummary,
  SslMode,
} from '@/modules/database-manager/domain/contracts'

import {
  buildConnectionUri,
  connectionPrincipalOptions,
  externalEndpoint,
  internalEndpoint,
  type ConnectionEndpoint,
} from '../model/connectionDetails'
import type {
  ConnectionDetailsActions,
  ConnectionDetailsModel,
} from '../model/connectionDetailsViewModels'
import { clipboardClient } from '../services/clipboardClient'
import { databaseManagerClient } from '../services/databaseManagerClient'

interface Options {
  canEditExternal: boolean
  connection: ConnectionSummary | null
  currentUser: string | null
  onConnectionUpdated: (connection: ConnectionSummary) => void
  principals: readonly PrincipalSummary[]
}

export function useConnectionDetails({
  canEditExternal,
  connection,
  currentUser,
  onConnectionUpdated,
  principals,
}: Options): { actions: ConnectionDetailsActions; model: ConnectionDetailsModel } {
  const [copied, setCopied] = useState('')
  const [database, setDatabase] = useState('')
  const [error, setError] = useState('')
  const [externalHost, setExternalHost] = useState('')
  const [externalPort, setExternalPort] = useState('')
  const [externalSslMode, setExternalSslMode] = useState<SslMode>('verify-full')
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [selectedPrincipal, setSelectedPrincipal] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const principalOptions = useMemo(
    () => connectionPrincipalOptions(principals, currentUser ?? ''),
    [currentUser, principals],
  )
  const selectedOption = principalOptions.find((option) => option.value === selectedPrincipal)

  const close = () => {
    setOpen(false)
    setPassword('')
    setCopied('')
    setError('')
  }

  const endpointFor = (kind: 'external' | 'internal'): ConnectionEndpoint | null => {
    if (!connection) return null
    return kind === 'internal' ? internalEndpoint(connection) : externalEndpoint(connection)
  }

  const copyUrl = async (kind: 'external' | 'internal', template: boolean) => {
    setError('')
    setCopied('')
    const endpoint = endpointFor(kind)
    const principal = selectedOption
    if (!endpoint || !principal) {
      setError(
        endpoint
          ? 'Select a standard login account first.'
          : 'Configure the external endpoint first.',
      )
      return
    }
    if (!template && !password) {
      setError('Enter that database account password to copy a complete URL.')
      return
    }
    const uri = buildConnectionUri({
      database,
      endpoint,
      engine: connection?.engine ?? 'postgresql',
      password: template ? 'PASSWORD' : password,
      username: principal.authenticationUsername,
    })
    try {
      await clipboardClient.copy(uri)
      setCopied(
        `${kind === 'internal' ? 'Internal' : 'External'} ${template ? 'template' : 'URL'} copied.`,
      )
    } catch {
      setError('The browser could not copy the URL.')
    }
  }

  const saveExternal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!connection || !canEditExternal) return
    setError('')
    setSubmitting(true)
    try {
      const updated = await databaseManagerClient.updateExternalEndpoint(connection.id, {
        host: externalHost.trim(),
        port: Number(externalPort),
        sslMode: externalSslMode,
      })
      onConnectionUpdated(updated)
      setPassword('')
      setCopied('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'External endpoint was not saved.')
    } finally {
      setSubmitting(false)
    }
  }

  const clearExternal = async () => {
    if (!connection || !canEditExternal) return
    setError('')
    setSubmitting(true)
    try {
      const updated = await databaseManagerClient.updateExternalEndpoint(connection.id, null)
      onConnectionUpdated(updated)
      setExternalHost('')
      setExternalPort('')
      setExternalSslMode(connection.sslMode)
      setPassword('')
      setCopied('')
    } catch (clearError) {
      setError(
        clearError instanceof Error ? clearError.message : 'External endpoint was not cleared.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const actions: ConnectionDetailsActions = {
    clearExternal,
    close,
    copyExternal: () => void copyUrl('external', false),
    copyExternalTemplate: () => void copyUrl('external', true),
    copyInternal: () => void copyUrl('internal', false),
    copyInternalTemplate: () => void copyUrl('internal', true),
    onExternalHostChange: (event: ChangeEvent<HTMLInputElement>) => {
      setExternalHost(event.target.value)
      setPassword('')
      setCopied('')
    },
    onExternalPortChange: (event: ChangeEvent<HTMLInputElement>) => {
      setExternalPort(event.target.value)
      setPassword('')
      setCopied('')
    },
    onExternalSslModeChange: (event: ChangeEvent<HTMLSelectElement>) => {
      setExternalSslMode(event.target.value as SslMode)
      setPassword('')
      setCopied('')
    },
    onPasswordChange: (event: ChangeEvent<HTMLInputElement>) => {
      setPassword(event.target.value)
      setCopied('')
    },
    onPrincipalChange: (event: ChangeEvent<HTMLSelectElement>) => {
      setSelectedPrincipal(event.target.value)
      setPassword('')
      setCopied('')
    },
    openDatabase: (event) => {
      if (!connection) return
      const nextDatabase = event.currentTarget.dataset.database
      if (!nextDatabase) return
      const external = externalEndpoint(connection)
      setDatabase(nextDatabase)
      setSelectedPrincipal(principalOptions[0]?.value ?? '')
      setExternalHost(external?.host ?? '')
      setExternalPort(String(external?.port ?? connection.port))
      setExternalSslMode(external?.sslMode ?? connection.sslMode)
      setError('')
      setCopied('')
      setPassword('')
      setOpen(true)
    },
    saveExternal,
  }

  const emptyInternal: ConnectionEndpoint = { host: '', port: 5432, sslMode: 'verify-full' }
  const internal = connection ? internalEndpoint(connection) : emptyInternal
  const external = connection ? externalEndpoint(connection) : null
  const templateFor = (endpoint: ConnectionEndpoint | null): string => {
    if (!endpoint || !connection) return ''
    if (!selectedOption) return 'Select a standard login account to build a URL.'
    return buildConnectionUri({
      database,
      endpoint,
      engine: connection.engine,
      password: 'PASSWORD',
      username: selectedOption.authenticationUsername,
    })
  }

  return {
    actions,
    model: {
      canEditExternal,
      connectionName: connection?.name ?? '',
      copied,
      database,
      engine: connection?.engine ?? 'postgresql',
      error,
      external,
      externalTemplate: templateFor(external),
      externalForm: {
        host: externalHost,
        port: externalPort,
        sslMode: externalSslMode,
      },
      internal,
      internalTemplate: templateFor(internal),
      open,
      password,
      principalOptions,
      selectedPrincipal,
      submitting,
    },
  }
}
