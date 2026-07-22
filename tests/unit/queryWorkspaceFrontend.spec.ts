import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { resolveManagerCapabilities } from '@/features/database-manager/model/managerCapabilities'
import { buildWorkspaceResultView } from '@/features/database-manager/model/workspaceMappers'
import {
  workspaceEngineStrategy,
  workspaceStarterQuery,
} from '@/features/database-manager/model/workspaceEngineStrategy'
import type {
  WorkspaceActions,
  WorkspaceModel,
} from '@/features/database-manager/model/workspaceViewModels'
import { ReadOnlySqlEditor } from '@/features/database-manager/ui/workspace/ReadOnlySqlEditor'
import { WorkspaceCredentialGate } from '@/features/database-manager/ui/workspace/WorkspaceCredentialGate'
import { WorkspaceResultGrid } from '@/features/database-manager/ui/workspace/WorkspaceResultGrid'
import type { EngineCapabilities } from '@/modules/database-manager/domain/contracts'

const engineCapabilities: EngineCapabilities = {
  accessLevels: ['connect', 'read', 'write', 'developer'],
      canCreateDatabase: true,
      canCreatePrincipal: true,
      supportsDatabaseOwners: true,
      supportsDefaultPrivileges: true,
  supportsObservability: true,
  supportsReadOnlyWorkspace: true,
  supportsSchemas: true,
}

const actions: WorkspaceActions = {
  browseRelation: () => undefined,
  connect: () => undefined,
  disconnect: () => undefined,
  nextPage: () => undefined,
  onDatabaseChange: () => undefined,
  onPasswordChange: () => undefined,
  onPrincipalChange: () => undefined,
  onQueryChange: () => undefined,
  previousPage: () => undefined,
  runQuery: () => undefined,
}

function workspaceModel(overrides: Partial<WorkspaceModel> = {}): WorkspaceModel {
  return {
    canNextPage: false,
    canPreviousPage: false,
    canRunQuery: true,
    canSubmitCredential: false,
    catalog: null,
    connected: false,
    copy: workspaceEngineStrategy('postgresql').copy,
    credential: { database: 'app', password: '', principal: 'app_reader' },
    databaseOptions: [{ label: 'app', value: 'app' }],
    error: null,
    loading: false,
    offset: 0,
    querySql: 'SELECT true AS enabled',
    relationRows: [],
    result: null,
    resultLabel: 'Read-only SQL result',
    resultView: null,
    roleOptions: [{ label: 'app_reader', value: 'app_reader' }],
    selectedRelation: null,
    ...overrides,
  }
}

describe('query workspace authorization model', () => {
  it.each(['owner', 'admin', 'operator'] as const)(
    'shows the workspace capability to %s when the engine supports it',
    (role) => {
      expect(resolveManagerCapabilities([role], engineCapabilities).canUseWorkspace).toBe(true)
    },
  )

  it('keeps the viewer out and obeys the engine capability flag', () => {
    expect(resolveManagerCapabilities(['viewer'], engineCapabilities).canUseWorkspace).toBe(false)
    expect(
      resolveManagerCapabilities(['owner'], {
        ...engineCapabilities,
        supportsReadOnlyWorkspace: false,
      }).canUseWorkspace,
    ).toBe(false)
  })
})

describe('query workspace view-model mapping', () => {
  it('preserves null and boolean meaning and combines truncation warnings', () => {
    const resultView = buildWorkspaceResultView({
      columns: [
        { dataTypeId: 16, name: 'enabled' },
        { dataTypeId: 25, name: 'optional' },
        { dataTypeId: 16, name: 'disabled' },
      ],
      durationMs: 7,
      rowCount: 2,
      rows: [
        [true, null, false],
        [false, 'text', true],
      ],
      truncated: true,
      truncatedCells: true,
    })

    expect(resultView?.rows[0]?.cells).toEqual(['true', 'NULL', 'false'])
    expect(resultView?.rows[1]?.cells).toEqual(['false', 'text', 'true'])
    expect(resultView?.warning).toContain('Result was truncated')
    expect(resultView?.warning).toContain('cells were shortened')
    expect(resultView?.summary).toContain('2 rows')
    expect(resultView?.summary).toContain('7 ms')
  })
})

describe('query workspace presentational safety', () => {
  it('masks the transient credential and explains that it is never persisted', () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceCredentialGate, {
        actions,
        model: workspaceModel(),
      }),
    )

    expect(html).toContain('type="password"')
    expect(html).toContain('autoComplete="off"')
    expect(html).toContain('sent with each authenticated workspace request')
    expect(html).toContain('never persisted, logged, or audited')
    expect(html).toContain('never uses the stored administrator credential')
  })

  it('renders the SQL guard limits and blocked-operation explanation', () => {
    const html = renderToStaticMarkup(
      createElement(ReadOnlySqlEditor, {
        actions,
        model: workspaceModel(),
      }),
    )

    expect(html).toContain('Read-only SQL')
    expect(html).toContain('5s')
    expect(html).toContain('200 rows')
    expect(html).toContain('1 MiB')
    expect(html).toContain('One query expression only')
    expect(html).toContain(
      'Writes, DDL, transaction control and administrator execution are blocked',
    )
    expect(html).toContain('SELECT true AS enabled')
  })

  it('renders typed values, headers and truncation feedback in the result grid', () => {
    const resultView = buildWorkspaceResultView({
      columns: [
        { dataTypeId: 25, name: 'name' },
        { dataTypeId: 16, name: 'enabled' },
        { dataTypeId: 25, name: 'optional' },
      ],
      durationMs: 4,
      rowCount: 1,
      rows: [['reader', true, null]],
      truncated: true,
      truncatedCells: false,
    })
    const html = renderToStaticMarkup(
      createElement(WorkspaceResultGrid, {
        actions,
        model: workspaceModel({ resultView }),
      }),
    )

    expect(html).toContain('<th>name</th>')
    expect(html).toContain('<th>enabled</th>')
    expect(html).toContain('<code>reader</code>')
    expect(html).toContain('<code>true</code>')
    expect(html).toContain('<code>NULL</code>')
    expect(html).toContain('Result was truncated by the row or response limit')
  })

  it('delegates MySQL identity and guard copy without PostgreSQL SQL leakage', () => {
    const copy = workspaceEngineStrategy('mysql').copy
    const model = workspaceModel({ copy, querySql: workspaceStarterQuery })
    const credentialHtml = renderToStaticMarkup(
      createElement(WorkspaceCredentialGate, { actions, model }),
    )
    const editorHtml = renderToStaticMarkup(createElement(ReadOnlySqlEditor, { actions, model }))

    expect(credentialHtml).toContain('restricted MySQL account')
    expect(credentialHtml).toContain('Restricted account')
    expect(editorHtml).toContain('MySQL read-only session guard')
    expect(editorHtml).toContain('CURRENT_USER')
    expect(`${credentialHtml}${editorHtml}`).not.toContain('PostgreSQL')
    expect(workspaceStarterQuery).not.toContain('current_database')
  })

  it('keeps MySQL role-linked accounts out of the transient workspace selector', () => {
    const account = {
      canCreateDatabase: false,
      canCreateRole: false,
      canLogin: true,
      isSuperuser: false,
      memberships: ['app_role@%'],
      name: 'app_reader@%',
      validUntil: null,
    }

    expect(workspaceEngineStrategy('mysql').principalIsEligible(account, 'root@%')).toBe(false)
    expect(workspaceEngineStrategy('postgresql').principalIsEligible(account, 'postgres')).toBe(true)
  })
})
