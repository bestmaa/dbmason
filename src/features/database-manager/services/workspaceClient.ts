import { z } from 'zod'

import { relationKinds } from '@/modules/database-manager/domain/workspace'
import type {
  BrowseRelationCommand,
  LoadWorkspaceCatalogCommand,
  RunReadOnlyQueryCommand,
  WorkspaceCatalog,
  WorkspaceQueryResult,
} from '@/modules/database-manager/domain/workspace'

import { requestJson } from './managerHttpClient'

const workspaceCatalogSchema = z.object({
  database: z.string(),
  relations: z.array(
    z.object({
      estimatedRows: z.string().nullable(),
      kind: z.enum(relationKinds),
      name: z.string(),
      schema: z.string(),
      sizeBytes: z.string().nullable(),
    }),
  ),
  truncated: z.boolean(),
})

const workspaceQueryResultSchema = z.object({
  columns: z.array(z.object({ dataTypeId: z.number().int(), name: z.string() })),
  durationMs: z.number().nonnegative(),
  rowCount: z.number().int().nonnegative(),
  rows: z.array(z.array(z.union([z.boolean(), z.null(), z.number(), z.string()]))),
  truncated: z.boolean(),
  truncatedCells: z.boolean(),
})

function post<TInput, TOutput>(
  connectionId: string,
  operation: string,
  input: TInput,
  schema: z.ZodType<TOutput>,
  signal?: AbortSignal,
): Promise<TOutput> {
  return requestJson(
    `/api/db-manager/v1/connections/${connectionId}/workspace/${operation}`,
    schema,
    { body: JSON.stringify(input), method: 'POST', signal: signal ?? null },
  )
}

export const workspaceClient = {
  loadCatalog(
    connectionId: string,
    input: LoadWorkspaceCatalogCommand,
    signal?: AbortSignal,
  ): Promise<WorkspaceCatalog> {
    return post(connectionId, 'catalog', input, workspaceCatalogSchema, signal)
  },

  browseRelation(
    connectionId: string,
    input: BrowseRelationCommand,
    signal?: AbortSignal,
  ): Promise<WorkspaceQueryResult> {
    return post(connectionId, 'rows', input, workspaceQueryResultSchema, signal)
  },

  runReadOnlyQuery(
    connectionId: string,
    input: RunReadOnlyQueryCommand,
    signal?: AbortSignal,
  ): Promise<WorkspaceQueryResult> {
    return post(connectionId, 'query', input, workspaceQueryResultSchema, signal)
  },
}
