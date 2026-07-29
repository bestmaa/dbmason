type Release = () => void

interface WaitingOperation {
  reject: (error: Error) => void
  resolve: (release: Release) => void
  timeout: ReturnType<typeof setTimeout>
}

export class MysqlCapacityError extends Error {
  readonly code = 'MYSQL_CAPACITY'

  constructor() {
    super('MySQL operation capacity is temporarily exhausted.')
    this.name = 'MysqlCapacityError'
  }
}

class MysqlOperationLimiter {
  private active = 0
  private readonly waiting: WaitingOperation[] = []

  constructor(
    private readonly limit: number,
    private readonly maximumWaiting: number,
    private readonly waitTimeoutMs: number,
  ) {}

  async acquire(): Promise<Release> {
    if (this.active < this.limit) {
      this.active += 1
      return this.releaseFunction()
    }
    if (this.waiting.length >= this.maximumWaiting) throw new MysqlCapacityError()
    return new Promise<Release>((resolve, reject) => {
      const operation: WaitingOperation = {
        reject,
        resolve,
        timeout: setTimeout(() => {
          const index = this.waiting.indexOf(operation)
          if (index >= 0) this.waiting.splice(index, 1)
          reject(new MysqlCapacityError())
        }, this.waitTimeoutMs),
      }
      this.waiting.push(operation)
    })
  }

  private releaseFunction(): Release {
    let released = false
    return () => {
      if (released) return
      released = true
      const next = this.waiting.shift()
      if (next) {
        clearTimeout(next.timeout)
        next.resolve(this.releaseFunction())
      } else this.active -= 1
    }
  }
}

export const mysqlOperationLimiter = new MysqlOperationLimiter(8, 32, 5_000)
export const mysqlWorkspaceOperationLimiter = new MysqlOperationLimiter(2, 8, 3_000)
export const mysqlInventoryOperationLimiter = new MysqlOperationLimiter(1, 4, 2_000)
