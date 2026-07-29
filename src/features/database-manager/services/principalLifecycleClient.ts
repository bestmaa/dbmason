import { z } from 'zod'

import { accessPresetMatches, accessSources } from '@/modules/database-manager/domain/contracts'
import type {
  AccessLevel,
  PrincipalAccessInventory,
  RotatePrincipalPasswordResult,
} from '@/modules/database-manager/domain/contracts'

import { requestJson } from './managerHttpClient'

const warningsSchema = z.object({ warnings: z.array(z.string()) })
const accessInventorySchema = z.object({
  databases: z.array(
    z.object({
      database: z.string(),
      directPreset: z.enum(accessPresetMatches),
      effectivePreset: z.enum(accessPresetMatches),
      potentialPreset: z.enum(accessPresetMatches),
      sources: z.array(z.enum(accessSources)),
    }).strict(),
  ),
  observedAt: z.string().datetime(),
  principal: z.string(),
  truncated: z.boolean(),
}).strict()

function principalPath(connectionId: string, principal: string): string {
  return `/api/db-manager/v1/connections/${encodeURIComponent(connectionId)}/principals/${encodeURIComponent(principal)}`
}

export const principalLifecycleClient = {
  getAccess(
    connectionId: string,
    principal: string,
    signal?: AbortSignal,
  ): Promise<PrincipalAccessInventory> {
    return requestJson(
      `${principalPath(connectionId, principal)}/access`,
      accessInventorySchema,
      { signal: signal ?? null },
    )
  },

  async setAccess(
    connectionId: string,
    principal: string,
    input: { database: string; level: AccessLevel },
  ): Promise<readonly string[]> {
    const result = await requestJson(
      `${principalPath(connectionId, principal)}/access`,
      warningsSchema.extend({ updated: z.literal(true) }),
      { body: JSON.stringify(input), method: 'POST' },
    )
    return result.warnings
  },

  async revokeAccess(
    connectionId: string,
    principal: string,
    database: string,
  ): Promise<readonly string[]> {
    const result = await requestJson(
      `${principalPath(connectionId, principal)}/access`,
      warningsSchema.extend({ revoked: z.literal(true) }),
      { body: JSON.stringify({ database }), method: 'DELETE' },
    )
    return result.warnings
  },

  async setLogin(connectionId: string, principal: string, enabled: boolean): Promise<void> {
    await requestJson(
      `${principalPath(connectionId, principal)}/login`,
      z.object({ enabled: z.literal(enabled), updated: z.literal(true) }),
      { body: JSON.stringify({ enabled }), method: 'PATCH' },
    )
  },

  rotatePassword(
    connectionId: string,
    principal: string,
  ): Promise<RotatePrincipalPasswordResult> {
    return requestJson(
      `${principalPath(connectionId, principal)}/password`,
      z.object({ oneTimePassword: z.string(), principal: z.string() }),
      { method: 'POST' },
    )
  },

  async drop(connectionId: string, principal: string): Promise<void> {
    await requestJson(
      principalPath(connectionId, principal),
      z.object({ dropped: z.literal(true) }),
      { method: 'DELETE' },
    )
  },
}
