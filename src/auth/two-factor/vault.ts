import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

import { getServerEnv } from '@/config/env'

const algorithm = 'aes-256-gcm'
const envelopeVersion = 'v1'
const recoveryCodePattern = /^[A-Z\d]{20}$/u

function deriveKey(purpose: 'recovery-codes' | 'totp-encryption'): Buffer {
  const masterKey = Buffer.from(getServerEnv().CONNECTION_ENCRYPTION_KEY, 'hex')
  return Buffer.from(
    hkdfSync(
      'sha256',
      masterKey,
      Buffer.from('dbmason:two-factor:v1', 'utf8'),
      Buffer.from(purpose, 'utf8'),
      32,
    ),
  )
}

function associatedData(binding: string): Buffer {
  return Buffer.from(`dbmason:two-factor:totp:${binding}`, 'utf8')
}

export function encryptTotpSecret(binding: string, secret: string): string {
  const initializationVector = randomBytes(12)
  const cipher = createCipheriv(algorithm, deriveKey('totp-encryption'), initializationVector)
  cipher.setAAD(associatedData(binding))
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const authenticationTag = cipher.getAuthTag()

  return [
    envelopeVersion,
    initializationVector.toString('base64url'),
    authenticationTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

export function decryptTotpSecret(binding: string, envelope: string): string {
  const [version, encodedIv, encodedTag, encodedPayload, extra] = envelope.split('.')
  if (
    version !== envelopeVersion ||
    !encodedIv ||
    !encodedTag ||
    !encodedPayload ||
    extra !== undefined
  ) {
    throw new Error('Unsupported encrypted TOTP envelope')
  }

  const decipher = createDecipheriv(
    algorithm,
    deriveKey('totp-encryption'),
    Buffer.from(encodedIv, 'base64url'),
  )
  decipher.setAAD(associatedData(binding))
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encodedPayload, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function normalizeRecoveryCode(value: string): string | null {
  const normalized = value.toUpperCase().replaceAll(/[\s-]/gu, '')
  return recoveryCodePattern.test(normalized) ? normalized : null
}

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(10).toString('hex').toUpperCase()
    return raw.match(/.{1,5}/gu)?.join('-') ?? raw
  })
}

export function hashRecoveryCode(code: string): string {
  const normalized = normalizeRecoveryCode(code)
  if (!normalized) throw new Error('Invalid recovery code')
  return createHmac('sha256', deriveKey('recovery-codes'))
    .update(normalized, 'utf8')
    .digest('base64url')
}

export function findRecoveryCodeHash(
  suppliedCode: string,
  storedHashes: readonly string[],
): string | null {
  const normalized = normalizeRecoveryCode(suppliedCode)
  if (!normalized) return null
  const candidate = Buffer.from(hashRecoveryCode(normalized))

  for (const storedHash of storedHashes) {
    const stored = Buffer.from(storedHash)
    if (candidate.length === stored.length && timingSafeEqual(candidate, stored)) return storedHash
  }
  return null
}
