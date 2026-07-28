import type { CollectionConfig } from 'payload'

import { authenticated } from '@/access/appRoles'

export const DatabaseConnections: CollectionConfig = {
  slug: 'database-connections',
  access: {
    create: () => false,
    delete: () => false,
    read: authenticated,
    update: () => false,
  },
  admin: {
    defaultColumns: ['name', 'engine', 'host', 'port', 'status', 'lastCheckedAt'],
    description: 'Connection metadata. Changes are performed through the manager UI.',
    group: false,
    hideAPIURL: true,
    useAsTitle: 'name',
  },
  fields: [
    { name: 'publicId', type: 'text', required: true, unique: true, index: true },
    { name: 'name', type: 'text', required: true, index: true },
    {
      name: 'engine',
      type: 'select',
      defaultValue: 'postgresql',
      options: [
        { label: 'PostgreSQL', value: 'postgresql' },
        { label: 'MySQL', value: 'mysql' },
      ],
      required: true,
    },
    { name: 'host', type: 'text', required: true },
    { name: 'port', type: 'number', defaultValue: 5432, min: 1, max: 65535, required: true },
    { name: 'maintenanceDatabase', type: 'text', defaultValue: 'postgres', required: true },
    { name: 'username', type: 'text', required: true },
    {
      name: 'sslMode',
      type: 'select',
      defaultValue: 'verify-full',
      options: [
        { label: 'Verify certificate (recommended)', value: 'verify-full' },
        { label: 'Require TLS (certificate not verified)', value: 'require' },
        { label: 'Prefer (legacy; may be plaintext)', value: 'prefer' },
        { label: 'Disabled (plaintext)', value: 'disable' },
      ],
      required: true,
    },
    {
      name: 'externalHost',
      type: 'text',
      admin: {
        description:
          'Optional public or cross-network hostname. DBMason never opens network access automatically.',
      },
    },
    {
      name: 'externalPort',
      type: 'number',
      admin: { description: 'Optional external listener port.' },
      min: 1,
      max: 65535,
    },
    {
      name: 'externalSslMode',
      type: 'select',
      admin: { description: 'TLS expectation for the optional external endpoint.' },
      options: [
        { label: 'Verify certificate (recommended)', value: 'verify-full' },
        { label: 'Require TLS (certificate not verified)', value: 'require' },
        { label: 'Prefer (legacy; may be plaintext)', value: 'prefer' },
        { label: 'Disabled (plaintext)', value: 'disable' },
      ],
    },
    {
      name: 'encryptedSecret',
      type: 'text',
      access: { read: () => false },
      admin: { hidden: true },
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'unknown',
      index: true,
      options: ['unknown', 'online', 'offline'],
      required: true,
    },
    { name: 'serverVersion', type: 'text', admin: { readOnly: true } },
    { name: 'lastCheckedAt', type: 'date', admin: { readOnly: true } },
    { name: 'lastLatencyMs', type: 'number', admin: { readOnly: true } },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      maxDepth: 0,
      required: true,
    },
  ],
  labels: {
    plural: 'Connection records',
    singular: 'Connection record',
  },
  timestamps: true,
}
