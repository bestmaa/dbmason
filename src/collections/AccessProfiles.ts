import type { CollectionConfig } from 'payload'

import { authenticated, ownersAndAdmins } from '@/access/appRoles'

export const AccessProfiles: CollectionConfig = {
  slug: 'access-profiles',
  access: {
    create: ownersAndAdmins,
    delete: ownersAndAdmins,
    read: authenticated,
    update: ownersAndAdmins,
  },
  admin: {
    defaultColumns: ['name', 'engine', 'level', 'builtIn'],
    description: 'Reusable database access templates for DBMason operators.',
    group: false,
    hideAPIURL: true,
    useAsTitle: 'name',
  },
  fields: [
    { name: 'name', type: 'text', index: true, required: true },
    { name: 'code', type: 'text', index: true, required: true, unique: true },
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
    {
      name: 'level',
      type: 'select',
      options: [
        { label: 'Connect only', value: 'connect' },
        { label: 'Read only', value: 'read' },
        { label: 'Read and write', value: 'write' },
        { label: 'Developer', value: 'developer' },
      ],
      required: true,
    },
    { name: 'description', type: 'textarea', required: true },
    { name: 'builtIn', type: 'checkbox', defaultValue: false, required: true },
  ],
  labels: {
    plural: 'Access profiles',
    singular: 'Access profile',
  },
  timestamps: true,
}
