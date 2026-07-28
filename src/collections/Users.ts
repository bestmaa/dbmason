import type { CollectionConfig } from 'payload'

import { appRoles } from '@/access/appRoles'
import { twoFactorEndpoints } from '@/auth/two-factor/endpoints'
import {
  enforceTwoFactorAuthOperation,
  enforceTwoFactorLogin,
} from '@/auth/two-factor/loginContext'
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

const noClientAccess = {
  create: () => false,
  read: () => false,
  update: () => false,
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
      description: 'DBMason application accounts and product roles.',
      group: false,
      hideAPIURL: true,
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
    endpoints: twoFactorEndpoints,
    hooks: {
      beforeChange: [guardUserChange],
      beforeDelete: [guardUserDelete],
      beforeLogin: [enforceTwoFactorLogin],
      beforeOperation: [enforceUserPasswordPolicy, enforceTwoFactorAuthOperation],
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
      {
        name: 'twoFactorEnabled',
        type: 'checkbox',
        access: noClientAccess,
        defaultValue: false,
        hidden: true,
        saveToJWT: false,
      },
      {
        name: 'twoFactorSecret',
        type: 'text',
        access: noClientAccess,
        hidden: true,
        saveToJWT: false,
      },
      {
        name: 'twoFactorRecoveryCodeHashes',
        type: 'json',
        access: noClientAccess,
        defaultValue: [],
        hidden: true,
        saveToJWT: false,
      },
      {
        name: 'twoFactorLastCounter',
        type: 'number',
        access: noClientAccess,
        hidden: true,
        min: 0,
        saveToJWT: false,
      },
      {
        name: 'twoFactorFailedAttempts',
        type: 'number',
        access: noClientAccess,
        defaultValue: 0,
        hidden: true,
        min: 0,
        saveToJWT: false,
      },
      {
        name: 'twoFactorLockedUntil',
        type: 'date',
        access: noClientAccess,
        hidden: true,
        saveToJWT: false,
      },
    ],
    labels: {
      plural: 'Team accounts',
      singular: 'Team account',
    },
  }
}
