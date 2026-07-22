import { checkRuntimeReadiness, type ReadinessCheck } from './readiness'

export const dynamic = 'force-dynamic'

const healthHeaders = { 'Cache-Control': 'no-store' }

export async function createHealthResponse(
  checkReadiness: ReadinessCheck = checkRuntimeReadiness,
): Promise<Response> {
  try {
    if (await checkReadiness()) {
      return Response.json({ status: 'ok' }, { headers: healthHeaders })
    }
  } catch {
    // Keep health responses detail-free even if a custom probe throws.
  }
  return Response.json({ status: 'unhealthy' }, { headers: healthHeaders, status: 503 })
}

export function GET(): Promise<Response> {
  return createHealthResponse()
}
