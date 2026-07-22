import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { createScramSha256Verifier } from '@/modules/database-manager/infrastructure/security/scramSha256Verifier'

describe('createScramSha256Verifier', () => {
  it('matches the RFC 7677 exchange salt using PostgreSQL verifier formatting', () => {
    const verifier = createScramSha256Verifier('pencil', {
      salt: Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64'),
    })

    expect(verifier).toBe(
      'SCRAM-SHA-256$4096:W22ZaJ0SNY7soEsUEjb6gQ==$' +
        'WG5d8oPm3OtcPnkdi4Uo7BkeZkBFzpcXkuLmtbsT4qY=:' +
        'wfPLwcE6nTWhTAmQ7tl2KeoiWGPlZqQxSrmfPwDl2dU=',
    )
  })

  it('uses a fresh salt for every verifier', () => {
    const first = createScramSha256Verifier('generated_password')
    const second = createScramSha256Verifier('generated_password')

    expect(first).not.toBe(second)
    expect(first).toMatch(/^SCRAM-SHA-256\$4096:/u)
  })

  it.each([
    ['', 'password'],
    ['snowman-\u2603', 'password'],
    ['valid-password', 'salt'],
    ['valid-password', 'iterations'],
  ])('rejects unsafe %s input for %s validation', (password, input) => {
    const action =
      input === 'salt'
        ? () => createScramSha256Verifier(password, { salt: new Uint8Array(15) })
        : input === 'iterations'
          ? () => createScramSha256Verifier(password, { iterations: 4_095 })
          : () => createScramSha256Verifier(password)

    expect(action).toThrow()
  })
})
