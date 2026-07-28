import { z } from 'zod'

import type { EngineId } from '../domain/contracts'
import { accessLevels, engineIds, sslModes } from '../domain/contracts'

interface ConnectionDefaults {
  maintenanceDatabase: string
  port: number
}

const connectionDefaults = {
  mysql: { maintenanceDatabase: 'mysql', port: 3306 },
  postgresql: { maintenanceDatabase: 'postgres', port: 5432 },
} as const satisfies Readonly<Record<EngineId, ConnectionDefaults>>

export const identifierSchema = z
  .string()
  .min(1)
  .max(320)
  .refine((value) => !value.includes('\0'), 'Identifier cannot contain a null character')

export const hostSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .refine((value) => !/[\s/\\\0@?#%[\]]/u.test(value), 'Enter a hostname or IP address')

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

export const createConnectionSchema = createConnectionFields.transform((input) => {
  const defaults = connectionDefaults[input.engine]
  return {
    ...input,
    maintenanceDatabase: input.maintenanceDatabase ?? defaults.maintenanceDatabase,
    port: input.port ?? defaults.port,
  }
})

export const updateExternalEndpointSchema = z
  .object({
    external: z
      .object({
        host: hostSchema,
        port: z.number().int().min(1).max(65535),
        sslMode: z.enum(sslModes),
      })
      .strict()
      .nullable(),
  })
  .strict()

export type UpdateExternalEndpointInput = z.infer<typeof updateExternalEndpointSchema>

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
