import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export const totpDigits = 6
export const totpPeriodSeconds = 30
export const totpWindow = 1

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let encoded = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      encoded += base32Alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) encoded += base32Alphabet[(value << (5 - bits)) & 31]
  return encoded
}

function decodeBase32(value: string): Buffer {
  const normalized = value.trim().toUpperCase().replaceAll('=', '')
  if (!normalized || !/^[A-Z2-7]+$/u.test(normalized)) {
    throw new Error('Invalid Base32 secret')
  }

  let bits = 0
  let accumulator = 0
  const bytes: number[] = []
  for (const character of normalized) {
    const index = base32Alphabet.indexOf(character)
    accumulator = (accumulator << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function normalizedCode(value: string): string | null {
  const code = value.replaceAll(/\s/gu, '')
  return new RegExp(`^\\d{${totpDigits}}$`, 'u').test(code) ? code : null
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20))
}

export function generateHotpCode(secret: string, counter: number, digits = totpDigits): string {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error('Invalid HOTP counter')
  if (!Number.isInteger(digits) || digits < 6 || digits > 8) throw new Error('Invalid HOTP digits')

  const counterBytes = Buffer.alloc(8)
  counterBytes.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBytes).digest()
  const offset = (digest.at(-1) ?? 0) & 15
  const truncated = digest.readUInt32BE(offset) & 0x7fffffff
  return String(truncated % 10 ** digits).padStart(digits, '0')
}

export function totpCounter(now = Date.now()): number {
  return Math.floor(now / 1000 / totpPeriodSeconds)
}

export function generateTotpCode(secret: string, now = Date.now()): string {
  return generateHotpCode(secret, totpCounter(now))
}

export function verifyTotpCode(
  secret: string,
  suppliedCode: string,
  options: { minimumCounterExclusive?: number; now?: number } = {},
): number | null {
  const code = normalizedCode(suppliedCode)
  if (!code) return null

  const current = totpCounter(options.now)
  for (const offset of [0, -1, 1]) {
    if (Math.abs(offset) > totpWindow) continue
    const counter = current + offset
    if (counter < 0 || counter <= (options.minimumCounterExclusive ?? -1)) continue
    const expected = generateHotpCode(secret, counter)
    if (timingSafeEqual(Buffer.from(code), Buffer.from(expected))) return counter
  }
  return null
}

export function buildTotpUri(account: string, secret: string, issuer = 'DBMason'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`
  const query = new URLSearchParams({
    algorithm: 'SHA1',
    digits: String(totpDigits),
    issuer,
    period: String(totpPeriodSeconds),
    secret,
  })
  return `otpauth://totp/${label}?${query.toString()}`
}
