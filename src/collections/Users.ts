import type { CollectionConfig } from 'payload'

import { appRoles } from '@/access/appRoles'
import {
  canCreateUser,
  canDeleteUser,
  canReadUser,
  canSetUserRoles,
  canUpdateUser,
  guardUserChange,
  guardUserDelete,
} from '@/access/userManagement'
import { enforceUserPasswordPolicy } from '@/access/userPasswordPolicy'

type UsersCollectionOptions = {
  secureCookies: boolean
}

export function createUsersCollection({ secureCookies }: UsersCollectionOptions): CollectionConfig {
  return {
    slug: 'users',
    access: {
      create: canCreateUser,
      delete: canDeleteUser,
      read: canReadUser,
      update: canUpdateUser,
    },
    admin: {
      useAsTitle: 'email',
    },
    auth: {
      cookies: {
        sameSite: 'Lax',
        secure: secureCookies,
      },
      lockTime: 10 * 60 * 1000,
      maxLoginAttempts: 5,
      tokenExpiration: 2 * 60 * 60,
    },
    hooks: {
      beforeChange: [guardUserChange],
      beforeDelete: [guardUserDelete],
      beforeOperation: [enforceUserPasswordPolicy],
    },
    fields: [
      {
        name: 'name',
        type: 'text',
        required: true,
      },
      {
        name: 'roles',
        type: 'select',
        access: {
          create: canSetUserRoles,
          update: canSetUserRoles,
        },
        defaultValue: ['viewer'],
        hasMany: true,
        options: appRoles.map((role) => ({
          label: role[0]?.toUpperCase() + role.slice(1),
          value: role,
        })),
        required: true,
        saveToJWT: true,
      },
    ],
  }
}
