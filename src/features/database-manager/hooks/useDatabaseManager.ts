'use client'

import { useEffect, useState } from 'react'

import type { ConnectionSummary } from '@/modules/database-manager/domain/contracts'

import { resolveManagerCapabilities } from '../model/managerCapabilities'
import { buildPrincipalRows } from '../model/principalRows'
import type { DatabaseManagerViewProps, ManagerIdentity, ResourceTab } from '../model/viewModels'
import { engineLabels, engineOptions, enginePresentation } from '../model/enginePresentation'
import { buildAccessLevelOptions } from '../model/accessLevelOptions'
import { buildDatabaseOptions, buildDatabaseTableViewModel } from '../model/databaseResources'
import { resolveWorkspaceState } from '../model/workspaceState'
import { databaseManagerClient } from '../services/databaseManagerClient'
import { managerErrorMessage, summarizeSnapshot } from './managerHookSupport'
import { useConnectionRemoval } from './useConnectionRemoval'
import { useObservability } from './useObservability'
import { useDatabaseWorkspace } from './useDatabaseWorkspace'
import { usePrincipalManagement } from './usePrincipalManagement'
import { useResourceCreation } from './useResourceCreation'
import { useResourceFilter } from './useResourceFilter'

export function useDatabaseManager(
  identity: ManagerIdentity,
): Omit<DatabaseManagerViewProps, 'product'> {
  const [connections, setConnections] = useState<readonly ConnectionSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<DatabaseManagerViewProps['model']['snapshot']>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [connectionLoadKey, setConnectionLoadKey] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState<ResourceTab>('databases')

  useEffect(() => {
    const controller = new AbortController()
    databaseManagerClient
      .listConnections(controller.signal)
      .then((nextConnections) => {
        setConnections(nextConnections)
        setSelectedId((current) => current ?? nextConnections[0]?.id ?? null)
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(managerErrorMessage(loadError))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [connectionLoadKey])

  useEffect(() => {
    if (!selectedId) return
    const controller = new AbortController()
    databaseManagerClient
      .getSnapshot(selectedId, controller.signal)
      .then(setSnapshot)
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(managerErrorMessage(loadError))
      })
    return () => controller.abort()
  }, [refreshKey, selectedId])

  const refresh = () => {
    setError(null)
    if (selectedId) {
      setSnapshot(null)
      setRefreshKey((value) => value + 1)
    } else {
      setLoading(true)
      setConnectionLoadKey((value) => value + 1)
    }
  }

  const refreshInPlace = () => {
    setError(null)
    if (selectedId) setRefreshKey((value) => value + 1)
  }

  const capabilities = resolveManagerCapabilities(identity.roles, snapshot?.capabilities ?? null)
  const selectedConnection = connections.find((item) => item.id === selectedId) ?? null
  const principalRows = buildPrincipalRows(snapshot)
  const resourceFilter = useResourceFilter(snapshot?.databases ?? [], principalRows)
  const databaseOptions = buildDatabaseOptions(snapshot?.databases ?? [])
  const resourceDatabaseTable = snapshot
    ? buildDatabaseTableViewModel(snapshot.engine, resourceFilter.visibleDatabases)
    : null
  const creation = useResourceCreation({
    accessLevels: snapshot?.capabilities.accessLevels ?? [],
    capabilities,
    onConnectionCreated: (connection) => {
      setConnections((current) => [...current, connection])
      setSnapshot(null)
      setSelectedId(connection.id)
    },
    onRefresh: refresh,
    selectedConnectionId: selectedId,
    supportsDatabaseOwners: snapshot?.capabilities.supportsDatabaseOwners ?? false,
  })
  const connectionRemoval = useConnectionRemoval({
    canDelete: capabilities.canDeleteConnection,
    onRemoved: (connectionId) => {
      const remaining = connections.filter((connection) => connection.id !== connectionId)
      setConnections(remaining)
      if (selectedId === connectionId) {
        setSnapshot(null)
        setSelectedId(remaining[0]?.id ?? null)
      }
    },
    selectedConnection,
  })
  const principalManagement = usePrincipalManagement({
    accessLevels: snapshot?.capabilities.accessLevels ?? [],
    canManage: capabilities.canManagePrincipals,
    connectionId: selectedId,
    databases: snapshot?.databases ?? [],
    onCredential: creation.showCredential,
    onRefresh: refreshInPlace,
    principals: principalRows,
  })
  const observability = useObservability({
    connectionId: selectedId,
    enabled: activeTab === 'observability',
    engine: selectedConnection?.engine ?? null,
  })
  const workspace = useDatabaseWorkspace({
    connectionId: selectedId,
    currentUser: snapshot?.currentUser ?? null,
    databases: snapshot?.databases ?? [],
    engine: selectedConnection?.engine ?? null,
    principals: snapshot?.principals ?? [],
  })
  const state = resolveWorkspaceState({
    error,
    hasConnections: connections.length > 0,
    hasSelectedConnection: selectedId !== null,
    hasSnapshot: snapshot !== null,
    loading,
  })

  return {
    actions: {
      ...creation.actions,
      browseDatabase: (event) => {
        const database = event.currentTarget.dataset.database
        if (!database) return
        workspace.selectDatabase(database)
        setActiveTab('workspace')
      },
      connectionRemoval: connectionRemoval.actions,
      observability: observability.actions,
      onResourceFilterChange: resourceFilter.onChange,
      principalManagement: principalManagement.actions,
      refresh,
      selectConnection: (event) => {
        setError(null)
        setSnapshot(null)
        setSelectedId(event.currentTarget.dataset.connectionId ?? null)
        setActiveTab('databases')
        resourceFilter.clear()
      },
      showDatabases: () => setActiveTab('databases'),
      showObservability: () => setActiveTab('observability'),
      showPrincipals: () => setActiveTab('principals'),
      showWorkspace: () => setActiveTab('workspace'),
      workspace: workspace.actions,
    },
    model: {
      accessOptions: buildAccessLevelOptions(snapshot?.capabilities.accessLevels ?? []),
      ...creation.model,
      activeTab,
      capabilities,
      connectionRemoval: connectionRemoval.model,
      connectionFormPresentation: enginePresentation(creation.model.connectionForm.engine),
      connections,
      databaseOptions,
      error,
      engineLabels,
      engineOptions,
      identity,
      observability: observability.model,
      principalManagement: principalManagement.model,
      principalRows,
      resourceDatabaseTable,
      resourceFilter: resourceFilter.value,
      resourcePrincipalRows: resourceFilter.visiblePrincipals,
      selectedConnection,
      selectedConnectionId: selectedId,
      selectedEnginePresentation: snapshot ? enginePresentation(snapshot.engine) : null,
      snapshot,
      state,
      totals: summarizeSnapshot(snapshot),
      workspace: workspace.model,
    },
  }
}
