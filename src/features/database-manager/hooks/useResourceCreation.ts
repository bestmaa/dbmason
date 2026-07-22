'use client'

import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

import type {
  AccessLevel,
  ConnectionSummary,
  CreatePrincipalResult,
} from '@/modules/database-manager/domain/contracts'

import type { ManagerCapabilities } from '../model/managerCapabilities'
import {
  parseAvailableAccessLevel,
  preferredAccessLevel,
} from '../model/accessLevelOptions'
import type { ManagerActions, ManagerViewModel } from '../model/viewModels'
import { clipboardClient } from '../services/clipboardClient'
import { databaseManagerClient } from '../services/databaseManagerClient'
import {
  connectionFormForEngine,
  initialConnectionForm,
  initialDatabaseForm,
  initialPrincipalForm,
  managerErrorMessage,
  parseEngineId,
} from './managerHookSupport'

interface ResourceCreationInput {
  accessLevels: readonly AccessLevel[]
  capabilities: ManagerCapabilities
  onConnectionCreated: (connection: ConnectionSummary) => void
  onRefresh: () => void
  selectedConnectionId: string | null
  supportsDatabaseOwners: boolean
}

interface ResourceCreationState {
  actions: Pick<
    ManagerActions,
    | 'closeDialog'
    | 'connectionForm'
    | 'copyCredential'
    | 'databaseForm'
    | 'openConnectionDialog'
    | 'openDatabaseDialog'
    | 'openPrincipalDialog'
    | 'principalForm'
  >
  model: Pick<
    ManagerViewModel,
    | 'connectionForm'
    | 'credential'
    | 'credentialCopied'
    | 'databaseForm'
    | 'dialogError'
    | 'openDialog'
    | 'principalForm'
    | 'submitting'
  >
  showCredential: (credential: CreatePrincipalResult) => void
}

export function useResourceCreation(input: ResourceCreationInput): ResourceCreationState {
  const [openDialog, setOpenDialog] = useState<ManagerViewModel['openDialog']>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [credential, setCredential] = useState<CreatePrincipalResult | null>(null)
  const [credentialCopied, setCredentialCopied] = useState(false)
  const [connectionForm, setConnectionForm] = useState(initialConnectionForm)
  const [databaseForm, setDatabaseForm] = useState(initialDatabaseForm)
  const [principalForm, setPrincipalForm] = useState(initialPrincipalForm)

  const showCredential = (nextCredential: CreatePrincipalResult) => {
    setCredential(nextCredential)
    setCredentialCopied(false)
    setDialogError(null)
    setOpenDialog('credential')
  }

  const closeDialog = () => {
    if (submitting) return
    if (openDialog === 'connection') {
      setConnectionForm((value) => connectionFormForEngine(value.engine))
    }
    if (openDialog === 'database') setDatabaseForm(initialDatabaseForm)
    if (openDialog === 'principal') setPrincipalForm(initialPrincipalForm)
    setOpenDialog(null)
    setDialogError(null)
    setCredentialCopied(false)
    setCredential(null)
  }

  const submitConnection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!input.capabilities.canCreateConnection) return
    setSubmitting(true)
    setDialogError(null)
    try {
      const connection = await databaseManagerClient.createConnection({
        ...connectionForm,
        port: Number(connectionForm.port),
      })
      setConnectionForm(connectionFormForEngine(connectionForm.engine))
      setOpenDialog(null)
      input.onConnectionCreated(connection)
    } catch (submitError: unknown) {
      setDialogError(managerErrorMessage(submitError))
    } finally {
      setConnectionForm((value) => ({ ...value, password: '' }))
      setSubmitting(false)
    }
  }

  const submitDatabase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!input.capabilities.canCreateDatabase || !input.selectedConnectionId) return
    setSubmitting(true)
    setDialogError(null)
    try {
      await databaseManagerClient.createDatabase(input.selectedConnectionId, {
        name: databaseForm.name,
        owner: input.supportsDatabaseOwners ? databaseForm.owner.trim() || null : null,
      })
      setDatabaseForm(initialDatabaseForm)
      setOpenDialog(null)
      input.onRefresh()
    } catch (submitError: unknown) {
      setDialogError(managerErrorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  const submitPrincipal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!input.capabilities.canCreatePrincipal || !input.selectedConnectionId) return
    setSubmitting(true)
    setDialogError(null)
    try {
      const result = await databaseManagerClient.createPrincipal(input.selectedConnectionId, {
        access:
          principalForm.database && input.accessLevels.includes(principalForm.level)
          ? [{ database: principalForm.database, level: principalForm.level }]
          : [],
        name: principalForm.name,
      })
      setPrincipalForm(initialPrincipalForm)
      showCredential(result)
      input.onRefresh()
    } catch (submitError: unknown) {
      setDialogError(managerErrorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return {
    actions: {
      closeDialog,
      connectionForm: {
        onEngineChange: (event) => {
          const engine = parseEngineId(event.target.value)
          if (!engine) return
          setConnectionForm((value) =>
            connectionFormForEngine(engine, {
              host: value.host,
              name: value.name,
              sslMode: value.sslMode,
            }),
          )
        },
        onHostChange: (event: ChangeEvent<HTMLInputElement>) =>
          setConnectionForm((value) => ({ ...value, host: event.target.value })),
        onMaintenanceDatabaseChange: (event) =>
          setConnectionForm((value) => ({ ...value, maintenanceDatabase: event.target.value })),
        onNameChange: (event) =>
          setConnectionForm((value) => ({ ...value, name: event.target.value })),
        onPasswordChange: (event) =>
          setConnectionForm((value) => ({ ...value, password: event.target.value })),
        onPortChange: (event) =>
          setConnectionForm((value) => ({ ...value, port: event.target.value })),
        onSslModeChange: (event) =>
          setConnectionForm((value) => ({
            ...value,
            sslMode: event.target.value as typeof value.sslMode,
          })),
        onSubmit: submitConnection,
        onUsernameChange: (event) =>
          setConnectionForm((value) => ({ ...value, username: event.target.value })),
      },
      copyCredential: () => {
        if (!credential) return
        setDialogError(null)
        void clipboardClient
          .copy(credential.oneTimePassword)
          .then(() => setCredentialCopied(true))
          .catch((copyError: unknown) => setDialogError(managerErrorMessage(copyError)))
      },
      databaseForm: {
        onNameChange: (event) =>
          setDatabaseForm((value) => ({ ...value, name: event.target.value })),
        onOwnerChange: (event) =>
          setDatabaseForm((value) => ({ ...value, owner: event.target.value })),
        onSubmit: submitDatabase,
      },
      openConnectionDialog: () => {
        if (input.capabilities.canCreateConnection) {
          setConnectionForm((value) => ({ ...value, password: '' }))
          setOpenDialog('connection')
        }
      },
      openDatabaseDialog: () => {
        if (input.capabilities.canCreateDatabase) setOpenDialog('database')
      },
      openPrincipalDialog: () => {
        if (input.capabilities.canCreatePrincipal) {
          setPrincipalForm({
            ...initialPrincipalForm,
            level: preferredAccessLevel(input.accessLevels),
          })
          setOpenDialog('principal')
        }
      },
      principalForm: {
        onDatabaseChange: (event) =>
          setPrincipalForm((value) => ({ ...value, database: event.target.value })),
        onLevelChange: (event) => {
          const level = parseAvailableAccessLevel(event.target.value, input.accessLevels)
          if (level) setPrincipalForm((value) => ({ ...value, level }))
        },
        onNameChange: (event) =>
          setPrincipalForm((value) => ({ ...value, name: event.target.value })),
        onSubmit: submitPrincipal,
      },
    },
    model: {
      connectionForm,
      credential,
      credentialCopied,
      databaseForm,
      dialogError,
      openDialog,
      principalForm,
      submitting,
    },
    showCredential,
  }
}
