import { z } from 'zod'

import { accessLevels, engineIds, sslModes } from '../domain/contracts'

export const identifierSchema = z
  .string()
  .min(1)
  .max(320)
  .refine((value) => !value.includes('\0'), 'Identifier cannot contain a null character')

const hostSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .refine((value) => !/[\s/\\\0]/u.test(value), 'Enter a hostname or IP address')

const createConnectionFields = z.object({
  engine: z.enum(engineIds).default('postgresql'),
  host: hostSchema,
  maintenanceDatabase: identifierSchema.optional(),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(1024),
  port: z.number().int().min(1).max(65535).optional(),
  sslMode: z.enum(sslModes).default('verify-full'),
  username: identifierSchema,
})

export const createConnectionSchema = createConnectionFields.transform((input) => ({
  ...input,
  maintenanceDatabase:
    input.maintenanceDatabase ?? (input.engine === 'mysql' ? 'mysql' : 'postgres'),
  port: input.port ?? (input.engine === 'mysql' ? 3306 : 5432),
}))

export const createDatabaseSchema = z.object({
  name: identifierSchema,
  owner: identifierSchema.nullable().default(null),
})

export const createPrincipalSchema = z.object({
  access: z
    .array(
      z.object({
        database: identifierSchema,
        level: z.enum(accessLevels),
      }),
    )
    .max(50)
    .default([]),
  name: identifierSchema,
})

export const principalRouteSchema = z.object({
  principal: identifierSchema,
})

export const setPrincipalAccessSchema = z
  .object({
    database: identifierSchema,
    level: z.enum(accessLevels),
  })
  .strict()

export const revokePrincipalAccessSchema = z
  .object({
    database: identifierSchema,
  })
  .strict()

export const setPrincipalLoginSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict()

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>
