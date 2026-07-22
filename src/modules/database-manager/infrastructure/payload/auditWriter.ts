import type { PayloadRequest } from 'payload'

import { ManagerError } from '../../domain/errors'

export interface AuditInput {
  action: string
  connectionId?: number
  durationMs?: number
  message?: string
  outcome: 'failed' | 'requested' | 'succeeded'
  requestId: string
  target: string
}

export async function writeAuditEvent(req: PayloadRequest, input: AuditInput): Promise<void> {
  if (!req.user) throw new ManagerError('UNAUTHENTICATED', 'Sign in is required.', 401)
  await req.payload.create({
    collection: 'audit-events',
    data: {
      action: input.action,
      actor: req.user.id,
      ...(input.connectionId === undefined ? {} : { connection: input.connectionId }),
      ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
      ...(input.message === undefined ? {} : { message: input.message }),
      outcome: input.outcome,
      requestId: input.requestId,
      target: input.target,
    },
    overrideAccess: true,
    req,
  })
}
