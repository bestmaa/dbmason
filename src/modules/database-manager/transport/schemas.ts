import { z } from 'zod'

import { accessLevels, sslModes } from '../domain/contracts'

export const identifierSchema = z
  .string()
  .min(1)
  .max(63)
  .refine((value) => !value.includes('\0'), 'Identifier cannot contain a null character')

const hostSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .refine((value) => !/[\s/\\\0]/u.test(value), 'Enter a hostname or IP address')

export const createConnectionSchema = z.object({
  host: hostSchema,
  maintenanceDatabase: identifierSchema.default('postgres'),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(1024),
  port: z.number().int().min(1).max(65535).default(5432),
  sslMode: z.enum(sslModes).default('verify-full'),
  username: identifierSchema,
})

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
