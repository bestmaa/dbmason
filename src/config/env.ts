import { z } from 'zod'

const publicExamplePayloadSecret = 'replace-with-at-least-32-random-characters'
const exactLoopbackHttpOrigin = /^http:\/\/(?:127\.0\.0\.1|\[::1\]|localhost)(?::\d{1,5})?\/?$/iu

const publicOriginSchema = z
  .string()
  .trim()
  .url()
  .superRefine((value, context) => {
    if (!URL.canParse(value)) return
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      context.addIssue({ code: 'custom', message: 'DBMASON_PUBLIC_URL must use HTTP or HTTPS.' })
    }
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      context.addIssue({
        code: 'custom',
        message: 'DBMASON_PUBLIC_URL must be an origin without credentials, path, query, or fragment.',
      })
    }
    if (url.protocol === 'http:' && !exactLoopbackHttpOrigin.test(value)) {
      context.addIssue({
        code: 'custom',
        message: 'DBMASON_PUBLIC_URL requires HTTPS unless it uses an exact loopback host.',
      })
    }
  })
  .transform((value) => new URL(value).origin)

const serverEnvSchema = z
  .object({
    CONNECTION_ENCRYPTION_KEY: z.string().regex(/^[a-f\d]{64}$/iu),
    DATABASE_HOST_ALLOWLIST: z.string().optional().default(''),
    DATABASE_URL: z.string().min(1),
    DBMASON_PUBLIC_URL: publicOriginSchema.optional(),
    NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),
    PAYLOAD_SECRET: z
      .string()
      .min(32)
      .refine((secret) => secret !== publicExamplePayloadSecret, {
        message: 'PAYLOAD_SECRET must not use the public example value.',
      }),
    PORT: z.coerce.number().int().min(1).max(65_535).optional().default(3000),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && !environment.DBMASON_PUBLIC_URL) {
      context.addIssue({
        code: 'custom',
        message: 'DBMASON_PUBLIC_URL is required in production.',
        path: ['DBMASON_PUBLIC_URL'],
      })
    }
  })
  .transform((environment) => ({
    ...environment,
    DBMASON_PUBLIC_URL:
      environment.DBMASON_PUBLIC_URL ?? `http://localhost:${environment.PORT}`,
  }))

export type ServerEnv = z.infer<typeof serverEnvSchema>

let cachedEnv: ServerEnv | undefined

export function parseServerEnv(input: unknown): ServerEnv {
  return serverEnvSchema.parse(input)
}

export function getServerEnv(): ServerEnv {
  cachedEnv ??= parseServerEnv(process.env)
  return cachedEnv
}
