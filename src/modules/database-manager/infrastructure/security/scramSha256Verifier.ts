import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'

const defaultIterations = 4_096
const defaultSaltBytes = 16

export interface ScramSha256Options {
  iterations?: number
  salt?: Uint8Array
}

function validatePassword(password: string): void {
  if (!/^[\x20-\x7E]+$/u.test(password)) {
    throw new Error('SCRAM passwords must be non-empty printable ASCII')
  }
}

function resolveIterations(iterations: number | undefined): number {
  const resolved = iterations ?? defaultIterations
  if (!Number.isInteger(resolved) || resolved < defaultIterations || resolved > 1_000_000) {
    throw new Error('SCRAM iteration count must be an integer between 4096 and 1000000')
  }
  return resolved
}

function resolveSalt(salt: Uint8Array | undefined): Buffer {
  const resolved = salt === undefined ? randomBytes(defaultSaltBytes) : Buffer.from(salt)
  if (resolved.byteLength < defaultSaltBytes || resolved.byteLength > 64) {
    throw new Error('SCRAM salt must be between 16 and 64 bytes')
  }
  return resolved
}

export function createScramSha256Verifier(
  password: string,
  options: Readonly<ScramSha256Options> = {},
): string {
  validatePassword(password)
  const iterations = resolveIterations(options.iterations)
  const salt = resolveSalt(options.salt)
  const saltedPassword = pbkdf2Sync(password, salt, iterations, 32, 'sha256')
  const clientKey = createHmac('sha256', saltedPassword).update('Client Key').digest()
  const storedKey = createHash('sha256').update(clientKey).digest('base64')
  const serverKey = createHmac('sha256', saltedPassword).update('Server Key').digest('base64')

  return [
    `SCRAM-SHA-256$${String(iterations)}:${salt.toString('base64')}`,
    `${storedKey}:${serverKey}`,
  ].join('$')
}
