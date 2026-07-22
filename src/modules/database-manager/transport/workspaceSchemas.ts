import { z } from 'zod'

import { identifierSchema } from './schemas'

const workspaceCredentialFields = {
  database: identifierSchema,
  password: z.string().min(1).max(1_024),
  principal: identifierSchema,
}

export const loadWorkspaceCatalogSchema = z.object(workspaceCredentialFields).strict()

export const browseWorkspaceRelationSchema = z
  .object({
    ...workspaceCredentialFields,
    limit: z.number().int().min(1).max(200).default(100),
    offset: z.number().int().min(0).max(100_000).default(0),
    relation: identifierSchema,
    schema: identifierSchema,
  })
  .strict()

export const runWorkspaceQuerySchema = z
  .object({
    ...workspaceCredentialFields,
    maxRows: z.number().int().min(1).max(200).default(200),
    sql: z
      .string()
      .min(1)
      .max(32_768)
      .refine((value) => value.trim().length > 0, 'Enter a PostgreSQL query'),
  })
  .strict()
