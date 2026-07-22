import { getServerEnv } from '@/config/env'

type RuntimeProbe = () => Promise<void>
type Clock = () => number

export type ReadinessCheck = () => Promise<boolean>

async function probeControlPlane(): Promise<void> {
  getServerEnv()
  const [{ getPayload }, { default: config }] = await Promise.all([
    import('payload'),
    import('@payload-config'),
  ])
  const payload = await getPayload({ config })
  await payload.count({ collection: 'users', overrideAccess: true })
}

export function createCachedReadinessCheck(
  probe: RuntimeProbe,
  ttlMs = 5_000,
  now: Clock = Date.now,
): ReadinessCheck {
  let cached: { expiresAt: number; healthy: boolean } | undefined
  let pending: Promise<boolean> | undefined

  return async () => {
    const currentTime = now()
    if (cached && currentTime < cached.expiresAt) return cached.healthy
    if (pending) return pending

    pending = (async () => {
      let healthy = false
      try {
        await probe()
        healthy = true
      } catch {
        healthy = false
      }
      cached = { expiresAt: now() + ttlMs, healthy }
      return healthy
    })().finally(() => {
      pending = undefined
    })

    return pending
  }
}

export const checkRuntimeReadiness = createCachedReadinessCheck(probeControlPlane)
