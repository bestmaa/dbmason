import { describe, expect, it } from 'vitest'

import { mysqlObservedThreadsRunning } from '@/modules/database-manager/infrastructure/mysql/MysqlObservability'

describe('MySQL observability boundaries', () => {
  it('subtracts the sampler from the running-thread counter', () => {
    expect(mysqlObservedThreadsRunning('0')).toBe(0)
    expect(mysqlObservedThreadsRunning('1')).toBe(0)
    expect(mysqlObservedThreadsRunning('4')).toBe(3)
  })
})
