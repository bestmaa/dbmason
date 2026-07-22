type Release = () => void

interface WaitingOperation {
  reject: (error: Error) => void
  resolve: (release: Release) => void
  timeout: ReturnType<typeof setTimeout>
}

export class PostgresCapacityError extends Error {
  readonly code = 'POSTGRES_CAPACITY'

  constructor() {
    super('PostgreSQL operation capacity is temporarily exhausted.')
    this.name = 'PostgresCapacityError'
  }
}

export class OperationLimiter {
  private active = 0
  private readonly waiting: WaitingOperation[] = []

  constructor(
    private readonly limit: number,
    private readonly maxWaiting: number,
    private readonly waitTimeoutMs: number,
  ) {
    if (limit < 1 || maxWaiting < 0 || waitTimeoutMs < 1) {
      throw new RangeError('Operation limiter values must be positive.')
    }
  }

  async acquire(): Promise<Release> {
    if (this.active < this.limit) {
      this.active += 1
      return this.createRelease()
    }

    if (this.waiting.length >= this.maxWaiting) throw new PostgresCapacityError()

    return new Promise<Release>((resolve, reject) => {
      const operation: WaitingOperation = {
        reject,
        resolve,
        timeout: setTimeout(() => {
          const index = this.waiting.indexOf(operation)
          if (index >= 0) this.waiting.splice(index, 1)
          reject(new PostgresCapacityError())
        }, this.waitTimeoutMs),
      }
      this.waiting.push(operation)
    })
  }

  private createRelease(): Release {
    let released = false
    return () => {
      if (released) return
      released = true
      const next = this.waiting.shift()
      if (next) {
        clearTimeout(next.timeout)
        next.resolve(this.createRelease())
      } else this.active -= 1
    }
  }
}

export const postgresOperationLimiter = new OperationLimiter(8, 32, 5_000)

// Interactive queries have a tighter budget than short manager operations so a
// few expensive reads cannot consume every PostgreSQL slot or inflate memory.
export const postgresWorkspaceOperationLimiter = new OperationLimiter(2, 8, 3_000)
