import type { CollectionConfig } from 'payload'

import { canOperate } from '@/access/appRoles'

export const AuditEvents: CollectionConfig = {
  slug: 'audit-events',
  access: {
    create: () => false,
    delete: () => false,
    read: canOperate,
    update: () => false,
  },
  admin: {
    defaultColumns: ['action', 'outcome', 'target', 'actor', 'createdAt'],
    group: 'Database Manager',
    useAsTitle: 'action',
  },
  fields: [
    { name: 'requestId', type: 'text', index: true, required: true },
    { name: 'action', type: 'text', index: true, required: true },
    {
      name: 'outcome',
      type: 'select',
      options: ['requested', 'succeeded', 'failed'],
      required: true,
    },
    { name: 'target', type: 'text', required: true },
    { name: 'message', type: 'textarea' },
    { name: 'durationMs', type: 'number' },
    { name: 'actor', type: 'relationship', relationTo: 'users', maxDepth: 0, required: true },
    {
      name: 'connection',
      type: 'relationship',
      relationTo: 'database-connections',
      maxDepth: 0,
    },
  ],
  timestamps: true,
}
