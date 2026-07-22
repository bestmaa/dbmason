'use client'

import { useEffect, useRef, useState } from 'react'

import type {
  DatabaseSummary,
  PrincipalSummary,
} from '@/modules/database-manager/domain/contracts'
import type { RelationSummary } from '@/modules/database-manager/domain/workspace'

import type {
  WorkspaceController,
  WorkspaceCredentialValue,
} from '../model/workspaceViewModels'
import { buildWorkspaceRelationRows, buildWorkspaceResultView } from '../model/workspaceMappers'
import { workspaceClient } from '../services/workspaceClient'
import { managerErrorMessage } from './managerHookSupport'

const pageSize = 100
const starterQuery = `SELECT current_database() AS database,
  current_user AS role,
  now() AS checked_at`

interface UsePostgresWorkspaceInput {
  connectionId: string | null
  currentUser: string | null
  databases: readonly DatabaseSummary[]
  principals: readonly PrincipalSummary[]
}

function availableRoles(
  principals: readonly PrincipalSummary[],
  currentUser: string | null,
): readonly PrincipalSummary[] {
  return principals.filter(
    (principal) =>
      principal.canLogin &&
      !principal.isSuperuser &&
      !principal.canCreateDatabase &&
      !principal.canCreateRole &&
      principal.name !== currentUser,
  )
}

export function usePostgresWorkspace(input: UsePostgresWorkspaceInput): WorkspaceController {
  const [credential, setCredential] = useState<WorkspaceCredentialValue>({
    database: '',
    password: '',
    principal: '',
  })
  const [catalog, setCatalog] = useState<WorkspaceController['model']['catalog']>(null)
  const [selectedRelation, setSelectedRelation] = useState<RelationSummary | null>(null)
  const [result, setResult] = useState<WorkspaceController['model']['result']>(null)
  const [resultLabel, setResultLabel] = useState('Query result')
  const [querySql, setQuerySql] = useState(starterQuery)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const roles = availableRoles(input.principals, input.currentUser)
  const database =
    credential.database || input.databases.find((item) => item.allowConnections)?.name || ''
  const principal = credential.principal || roles[0]?.name || ''
  const effectiveCredential = { ...credential, database, principal }

  useEffect(() => {
    requestRef.current?.abort()
    const timer = setTimeout(() => {
      setCredential({ database: '', password: '', principal: '' })
      setCatalog(null)
      setSelectedRelation(null)
      setResult(null)
      setError(null)
      setOffset(0)
    }, 0)
    return () => clearTimeout(timer)
  }, [input.connectionId])

  useEffect(() => () => requestRef.current?.abort(), [])

  const beginRequest = (): AbortController => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setError(null)
    return controller
  }

  const finishRequest = (controller: AbortController): void => {
    if (!controller.signal.aborted) setLoading(false)
    if (requestRef.current === controller) requestRef.current = null
  }

  const clearWorkspace = (next: WorkspaceCredentialValue): void => {
    requestRef.current?.abort()
    setCredential(next)
    setCatalog(null)
    setSelectedRelation(null)
    setResult(null)
    setError(null)
    setOffset(0)
  }

  const loadRelation = async (relation: RelationSummary, nextOffset: number): Promise<void> => {
    if (!input.connectionId) return
    const controller = beginRequest()
    try {
      const nextResult = await workspaceClient.browseRelation(
        input.connectionId,
        {
          ...effectiveCredential,
          limit: pageSize,
          offset: nextOffset,
          relation: relation.name,
          schema: relation.schema,
        },
        controller.signal,
      )
      if (!controller.signal.aborted) {
        setSelectedRelation(relation)
        setOffset(nextOffset)
        setResultLabel(`${relation.schema}.${relation.name}`)
        setResult(nextResult)
      }
    } catch (loadError) {
      if (!controller.signal.aborted) setError(managerErrorMessage(loadError))
    } finally {
      finishRequest(controller)
    }
  }

  return {
    actions: {
      browseRelation: (event) => {
        const schema = event.currentTarget.dataset.schema
        const relationName = event.currentTarget.dataset.relation
        const relation = catalog?.relations.find(
          (item) => item.schema === schema && item.name === relationName,
        )
        if (relation) void loadRelation(relation, 0)
      },
      connect: (event) => {
        event.preventDefault()
        if (!input.connectionId) return
        const controller = beginRequest()
        workspaceClient
          .loadCatalog(input.connectionId, effectiveCredential, controller.signal)
          .then((nextCatalog) => {
            if (!controller.signal.aborted) {
              setCatalog(nextCatalog)
              setResult(null)
              setSelectedRelation(null)
            }
          })
          .catch((loadError: unknown) => {
            if (!controller.signal.aborted) setError(managerErrorMessage(loadError))
          })
          .finally(() => finishRequest(controller))
      },
      disconnect: () => clearWorkspace({ ...effectiveCredential, password: '' }),
      nextPage: () => {
        if (selectedRelation) void loadRelation(selectedRelation, offset + pageSize)
      },
      onDatabaseChange: (event) =>
        clearWorkspace({ ...effectiveCredential, database: event.target.value }),
      onPasswordChange: (event) => setCredential({ ...effectiveCredential, password: event.target.value }),
      onPrincipalChange: (event) =>
        clearWorkspace({ ...effectiveCredential, password: '', principal: event.target.value }),
      onQueryChange: (event) => setQuerySql(event.target.value),
      previousPage: () => {
        if (selectedRelation) void loadRelation(selectedRelation, Math.max(0, offset - pageSize))
      },
      runQuery: (event) => {
        event.preventDefault()
        if (!input.connectionId) return
        const controller = beginRequest()
        workspaceClient
          .runReadOnlyQuery(
            input.connectionId,
            { ...effectiveCredential, maxRows: 200, sql: querySql },
            controller.signal,
          )
          .then((nextResult) => {
            if (!controller.signal.aborted) {
              setOffset(0)
              setResultLabel('Read-only SQL result')
              setResult(nextResult)
              setSelectedRelation(null)
            }
          })
          .catch((queryError: unknown) => {
            if (!controller.signal.aborted) setError(managerErrorMessage(queryError))
          })
          .finally(() => finishRequest(controller))
      },
    },
    model: {
      canNextPage: Boolean(selectedRelation && result?.truncated && result.rowCount === pageSize),
      canPreviousPage: Boolean(selectedRelation && offset > 0),
      canRunQuery: Boolean(querySql.trim() && !loading),
      canSubmitCredential: Boolean(database && principal && credential.password && !loading),
      catalog,
      connected: catalog !== null,
      credential: effectiveCredential,
      databaseOptions: input.databases
        .filter((item) => item.allowConnections)
        .map((item) => ({ label: item.name, value: item.name })),
      error,
      loading,
      offset,
      querySql,
      relationRows: buildWorkspaceRelationRows(catalog?.relations ?? [], selectedRelation),
      result,
      resultLabel,
      resultView: buildWorkspaceResultView(result),
      roleOptions: roles.map((item) => ({ label: item.name, value: item.name })),
      selectedRelation,
    },
    selectDatabase: (nextDatabase) =>
      clearWorkspace({ ...effectiveCredential, database: nextDatabase }),
  }
}
