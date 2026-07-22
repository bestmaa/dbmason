import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import { z } from 'zod'

import { getServerEnv } from '@/config/env'

import type { DatabaseConnectionConfig } from '../../domain/contracts'
import { sslModes } from '../../domain/contracts'

const algorithm = 'aes-256-gcm'
const envelopeVersion = 'v1'

const connectionSecretSchema = z.object({
  database: z.string().min(1),
  host: z.string().min(1),
  password: z.string(),
  port: z.number().int().min(1).max(65535),
  sslMode: z.enum(sslModes),
  username: z.string().min(1),
})

function encryptionKey(): Buffer {
  return Buffer.from(getServerEnv().CONNECTION_ENCRYPTION_KEY, 'hex')
}

function associatedData(publicId: string): Buffer {
  return Buffer.from(`db-control:connection:${publicId}`, 'utf8')
}

export function encryptConnectionSecret(
  publicId: string,
  secret: DatabaseConnectionConfig,
): string {
  const initializationVector = randomBytes(12)
  const cipher = createCipheriv(algorithm, encryptionKey(), initializationVector)
  cipher.setAAD(associatedData(publicId))

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(secret), 'utf8'),
    cipher.final(),
  ])
  const authenticationTag = cipher.getAuthTag()

  return [
    envelopeVersion,
    initializationVector.toString('base64url'),
    authenticationTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

export function decryptConnectionSecret(
  publicId: string,
  encryptedEnvelope: string,
): DatabaseConnectionConfig {
  const [version, encodedIv, encodedTag, encodedPayload, extra] = encryptedEnvelope.split('.')
  if (
    version !== envelopeVersion ||
    !encodedIv ||
    !encodedTag ||
    !encodedPayload ||
    extra !== undefined
  ) {
    throw new Error('Unsupported encrypted credential envelope')
  }

  const decipher = createDecipheriv(algorithm, encryptionKey(), Buffer.from(encodedIv, 'base64url'))
  decipher.setAAD(associatedData(publicId))
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encodedPayload, 'base64url')),
    decipher.final(),
  ]).toString('utf8')

  return connectionSecretSchema.parse(JSON.parse(decrypted) as unknown)
}
