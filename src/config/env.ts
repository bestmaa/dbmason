import { z } from 'zod'

const serverEnvSchema = z.object({
  CONNECTION_ENCRYPTION_KEY: z.string().regex(/^[a-f\d]{64}$/iu),
  DATABASE_HOST_ALLOWLIST: z.string().optional().default(''),
  DATABASE_URL: z.string().min(1),
  PAYLOAD_SECRET: z.string().min(32),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

let cachedEnv: ServerEnv | undefined

export function getServerEnv(): ServerEnv {
  cachedEnv ??= serverEnvSchema.parse(process.env)
  return cachedEnv
}
