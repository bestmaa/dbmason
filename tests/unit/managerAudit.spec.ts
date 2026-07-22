import type { PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auditMock = vi.hoisted(() => vi.fn())

vi.mock('@/modules/database-manager/infrastructure/payload/auditWriter', () => ({
  writeAuditEvent: auditMock,
}))

import { withAudit } from '@/modules/database-manager/application/managerService'

function requestWithLogger(logger: ReturnType<typeof vi.fn>): PayloadRequest {
  return { payload: { logger: { error: logger } } } as unknown as PayloadRequest
}

const context = { action: 'database.create', target: 'audit_test' }

describe('manager mutation auditing', () => {
  beforeEach(() => auditMock.mockReset())

  it('does not start remote work when the requested audit cannot be persisted', async () => {
    const operation = vi.fn(async () => 'not-run')
    auditMock.mockRejectedValueOnce(new Error('audit unavailable'))

    await expect(withAudit(requestWithLogger(vi.fn()), context, operation)).rejects.toThrow(
      'audit unavailable',
    )
    expect(operation).not.toHaveBeenCalled()
  })

  it('returns a completed remote result when the terminal success audit fails', async () => {
    const logger = vi.fn()
    auditMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('audit unavailable'))

    await expect(
      withAudit(requestWithLogger(logger), context, async () => 'created'),
    ).resolves.toBe('created')
    expect(logger).toHaveBeenCalledOnce()
  })

  it('preserves the sanitized operation error when the terminal failure audit also fails', async () => {
    auditMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('audit unavailable'))
    const databaseError = Object.assign(new Error('raw PostgreSQL detail'), { code: '42501' })

    await expect(
      withAudit(requestWithLogger(vi.fn()), context, async () => {
        throw databaseError
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_PRIVILEGE', status: 403 })
  })

  it('ignores logger transport failure after a completed remote operation', async () => {
    const logger = vi.fn(() => {
      throw new Error('logger transport failed')
    })
    auditMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('audit unavailable'))

    await expect(withAudit(requestWithLogger(logger), context, async () => 'created')).resolves.toBe(
      'created',
    )
  })
})
