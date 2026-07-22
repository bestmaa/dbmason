import type { PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { parseBoundedJson } from '@/modules/database-manager/transport/endpointSupport'

const schema = z.object({ value: z.string() }).strict()

function payloadRequest(body: string): PayloadRequest {
  return new Request('http://db-control.test/api/test', {
    body,
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  }) as PayloadRequest
}

describe('bounded JSON parser', () => {
  it('parses and validates a body inside the byte limit', async () => {
    await expect(parseBoundedJson(payloadRequest('{"value":"safe"}'), schema, 64)).resolves.toEqual(
      {
        value: 'safe',
      },
    )
  })

  it('rejects a streamed body after its decoded bytes cross the limit', async () => {
    const result = parseBoundedJson(payloadRequest('{"value":"too large"}'), schema, 8)
    await expect(result).rejects.toMatchObject({
      code: 'REQUEST_TOO_LARGE',
      status: 413,
    })
  })

  it('maps malformed JSON to a safe client error', async () => {
    const result = parseBoundedJson(payloadRequest('{not-json}'), schema, 64)
    await expect(result).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      status: 400,
    })
  })
})
