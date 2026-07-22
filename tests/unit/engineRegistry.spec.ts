import { describe, expect, it } from 'vitest'

import { engineIds } from '@/modules/database-manager/domain/contracts'
import { getDatabaseEngine } from '@/modules/database-manager/infrastructure/engines/engineRegistry'

describe('database engine registry', () => {
  it('registers an adapter with the matching identity for every engine', () => {
    expect(engineIds.map((id) => getDatabaseEngine(id).id)).toEqual(engineIds)
  })
})
