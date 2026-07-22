import { randomBytes } from 'node:crypto'

export function generateDatabasePassword(bytes = 24): string {
  if (!Number.isInteger(bytes) || bytes < 16 || bytes > 64) {
    throw new RangeError('Password entropy must be between 16 and 64 bytes')
  }

  return randomBytes(bytes).toString('base64url')
}
