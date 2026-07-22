import type { Access } from 'payload'

export const appRoles = ['owner', 'admin', 'operator', 'viewer'] as const
export type AppRole = (typeof appRoles)[number]

function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && appRoles.some((role) => role === value)
}

export function getAppRoles(user: unknown): readonly AppRole[] {
  if (typeof user !== 'object' || user === null || !('roles' in user)) return []
  const roles = user.roles
  return Array.isArray(roles) ? roles.filter(isAppRole) : []
}

export function hasAppRole(user: unknown, allowed: readonly AppRole[]): boolean {
  return getAppRoles(user).some((role) => allowed.includes(role))
}

export const authenticated: Access = ({ req }) => Boolean(req.user)
export const ownersOnly: Access = ({ req }) => hasAppRole(req.user, ['owner'])
export const ownersAndAdmins: Access = ({ req }) => hasAppRole(req.user, ['owner', 'admin'])
export const canOperate: Access = ({ req }) =>
  hasAppRole(req.user, ['owner', 'admin', 'operator'])
