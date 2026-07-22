import { describe, expect, it } from 'vitest'

import {
  revokePrincipalAccessSchema,
  setPrincipalAccessSchema,
  setPrincipalLoginSchema,
} from '@/modules/database-manager/transport/schemas'

describe('principal lifecycle schemas', () => {
  it('accepts only allowlisted access levels', () => {
    expect(setPrincipalAccessSchema.parse({ database: 'app', level: 'read' })).toEqual({
      database: 'app',
      level: 'read',
    })
    expect(() => setPrincipalAccessSchema.parse({ database: 'app', level: 'SUPERUSER' })).toThrow()
  })

  it('rejects arbitrary SQL and unknown lifecycle input', () => {
    expect(() =>
      revokePrincipalAccessSchema.parse({ database: 'app', sql: 'DROP DATABASE app' }),
    ).toThrow()
    expect(() => setPrincipalLoginSchema.parse({ enabled: false, role: 'admin' })).toThrow()
  })
})
