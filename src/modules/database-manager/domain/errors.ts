export class ManagerError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ManagerError'
    this.code = code
    this.status = status
  }
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

export function toManagerError(error: unknown): ManagerError {
  if (error instanceof ManagerError) return error

  const code = readErrorCode(error)
  if (code === 'ER_ACCESS_DENIED_ERROR')
    return new ManagerError('AUTH_FAILED', 'MySQL rejected the credentials.', 502)
  if (code === 'ER_BAD_DB_ERROR')
    return new ManagerError('DATABASE_NOT_FOUND', 'The MySQL database does not exist.', 404)
  if (code === 'ER_DB_CREATE_EXISTS' || code === 'ER_USER_ALREADY_EXISTS') {
    return new ManagerError('ALREADY_EXISTS', 'A MySQL resource with that name already exists.', 409)
  }
  if (code === 'ER_DB_DROP_EXISTS' || code === 'ER_NO_SUCH_USER') {
    return new ManagerError('RESOURCE_NOT_FOUND', 'The MySQL resource does not exist.', 404)
  }
  if (
    code === 'ER_DBACCESS_DENIED_ERROR' ||
    code === 'ER_SPECIFIC_ACCESS_DENIED_ERROR' ||
    code === 'ER_TABLEACCESS_DENIED_ERROR'
  ) {
    return new ManagerError('INSUFFICIENT_PRIVILEGE', 'The administrator lacks permission.', 403)
  }
  if (code === 'ER_CON_COUNT_ERROR' || code === 'MYSQL_CAPACITY') {
    return new ManagerError('SERVER_BUSY', 'The database manager is busy. Try again shortly.', 503)
  }
  if (code === '28P01')
    return new ManagerError('AUTH_FAILED', 'PostgreSQL rejected the credentials.', 502)
  if (code === '3D000')
    return new ManagerError('DATABASE_NOT_FOUND', 'The database does not exist.', 404)
  if (code === '42P04' || code === '42710') {
    return new ManagerError(
      'ALREADY_EXISTS',
      'A PostgreSQL resource with that name already exists.',
      409,
    )
  }
  if (code === '42704') {
    return new ManagerError('RESOURCE_NOT_FOUND', 'The PostgreSQL resource does not exist.', 404)
  }
  if (code === '2BP01') {
    return new ManagerError(
      'RESOURCE_HAS_DEPENDENCIES',
      'The PostgreSQL resource still has dependent objects or privileges.',
      409,
    )
  }
  if (code === '55006') {
    return new ManagerError('RESOURCE_IN_USE', 'The PostgreSQL resource is currently in use.', 409)
  }
  if (code === '42501')
    return new ManagerError('INSUFFICIENT_PRIVILEGE', 'The administrator lacks permission.', 403)
  if (code === 'POSTGRES_CAPACITY') {
    return new ManagerError('SERVER_BUSY', 'The database manager is busy. Try again shortly.', 503)
  }
  if (code === 'DATABASE_HOST_BLOCKED') {
    return new ManagerError('DATABASE_HOST_BLOCKED', 'The database host is blocked by policy.', 403)
  }
  if (code === 'ECONNREFUSED')
    return new ManagerError('CONNECTION_REFUSED', 'The server refused the connection.', 502)
  if (code === 'ENOTFOUND')
    return new ManagerError('HOST_NOT_FOUND', 'The database host could not be resolved.', 502)
  if (code === 'ETIMEDOUT' || code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
    return new ManagerError('CONNECTION_TIMEOUT', 'The database connection timed out.', 504)
  }

  return new ManagerError(
    'DATABASE_OPERATION_FAILED',
    'The database operation failed safely.',
    502,
    {
      cause: error,
    },
  )
}
