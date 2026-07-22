import { describe, expect, it } from 'vitest'

import { quoteIdentifier } from '@/modules/database-manager/infrastructure/postgresql/identifiers'

describe('quoteIdentifier', () => {
  it('quotes ordinary and reserved identifiers', () => {
    expect(quoteIdentifier('customer_db')).toBe('"customer_db"')
    expect(quoteIdentifier('select')).toBe('"select"')
  })

  it('keeps injection payloads inside one quoted identifier', () => {
    expect(quoteIdentifier('name"; DROP ROLE admin; --')).toBe(
      '"name""; DROP ROLE admin; --"',
    )
  })

  it('treats a dot as part of one identifier', () => {
    expect(quoteIdentifier('public.users')).toBe('"public.users"')
  })

  it('rejects empty, null-containing, and oversized identifiers', () => {
    expect(() => quoteIdentifier('')).toThrow(RangeError)
    expect(() => quoteIdentifier('bad\0name')).toThrow(RangeError)
    expect(() => quoteIdentifier('x'.repeat(64))).toThrow(RangeError)
  })
})
