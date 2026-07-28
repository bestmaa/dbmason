import { describe, expect, it } from 'vitest'

import {
  buildConnectionUri,
  connectionPrincipalOptions,
  externalEndpoint,
} from '@/features/database-manager/model/connectionDetails'
import type {
  ConnectionSummary,
  PrincipalSummary,
} from '@/modules/database-manager/domain/contracts'
import { updateExternalEndpointSchema } from '@/modules/database-manager/transport/schemas'

const connection: ConnectionSummary = {
  engine: 'postgresql',
  externalHost: null,
  externalPort: null,
  externalSslMode: null,
  host: 'postgres.internal',
  id: '1bb14642-9de4-4244-b948-95655d0195f4',
  lastCheckedAt: null,
  lastLatencyMs: null,
  name: 'Production',
  port: 5432,
  serverVersion: null,
  sslMode: 'verify-full',
  status: 'online',
}

function principal(overrides: Partial<PrincipalSummary> = {}): PrincipalSummary {
  return {
    authenticationUsername: 'reader',
    canCreateDatabase: false,
    canCreateRole: false,
    canLogin: true,
    isSuperuser: false,
    memberships: [],
    name: 'reader@%',
    validUntil: null,
    ...overrides,
  }
}

describe('safe database connection details', () => {
  it('builds RFC3986-safe PostgreSQL URLs with IPv6 and explicit TLS mode', () => {
    expect(
      buildConnectionUri({
        database: 'customer data',
        endpoint: { host: '2001:db8::7', port: 5432, sslMode: 'verify-full' },
        engine: 'postgresql',
        password: "p@ss!'()*",
        username: 'app user',
      }),
    ).toBe(
      'postgresql://app%20user:p%40ss%21%27%28%29%2A@[2001:db8::7]:5432/customer%20data?sslmode=verify-full',
    )
  })

  it('uses the MySQL authentication username rather than its host-qualified display name', () => {
    const options = connectionPrincipalOptions([principal()], 'root@%')
    expect(options).toEqual([
      {
        authenticationUsername: 'reader',
        label: 'reader@%',
        value: 'reader@%',
      },
    ])
    expect(
      buildConnectionUri({
        database: 'app',
        endpoint: { host: 'mysql.internal', port: 3306, sslMode: 'require' },
        engine: 'mysql',
        password: 'PASSWORD',
        username: options[0]?.authenticationUsername ?? '',
      }),
    ).toBe('mysql://reader:PASSWORD@mysql.internal:3306/app')
  })

  it('excludes active, privileged, role-linked and system accounts', () => {
    const principals = [
      principal(),
      principal({ name: 'root@%', authenticationUsername: 'root' }),
      principal({ isSuperuser: true, name: 'admin@%' }),
      principal({ memberships: ['app_role@%'], name: 'linked@%' }),
      principal({ authenticationUsername: 'mysql.sys', name: 'mysql.sys@localhost' }),
    ]
    expect(connectionPrincipalOptions(principals, 'root@%').map(({ value }) => value)).toEqual([
      'reader@%',
    ])
  })

  it('treats external endpoints as absent unless every metadata field is present', () => {
    expect(externalEndpoint(connection)).toBeNull()
    expect(
      externalEndpoint({
        ...connection,
        externalHost: 'db.example.com',
        externalPort: 6543,
        externalSslMode: 'require',
      }),
    ).toEqual({ host: 'db.example.com', port: 6543, sslMode: 'require' })
  })

  it('validates complete external metadata or an explicit clear operation', () => {
    expect(
      updateExternalEndpointSchema.parse({
        external: { host: 'db.example.com', port: 6543, sslMode: 'verify-full' },
      }),
    ).toEqual({
      external: { host: 'db.example.com', port: 6543, sslMode: 'verify-full' },
    })
    expect(updateExternalEndpointSchema.parse({ external: null })).toEqual({ external: null })
    expect(() =>
      updateExternalEndpointSchema.parse({
        external: { host: 'https://db.example.com', port: 6543, sslMode: 'require' },
      }),
    ).toThrow()
    expect(() =>
      updateExternalEndpointSchema.parse({
        external: { host: 'fe80::1%eth0', port: 5432, sslMode: 'require' },
      }),
    ).toThrow()
  })
})
