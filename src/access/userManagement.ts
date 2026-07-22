import { APIError } from 'payload'
import type {
  Access,
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  FieldAccess,
  PayloadRequest,
} from 'payload'

import { hasAppRole } from './appRoles'

const FORBIDDEN = 403
const CONFLICT = 409
// Collection hooks do not receive overrideAccess. This marks user-facing requests that actually
// passed through collection access, while keeping explicit server-side Local API calls privileged.
const accessCheckedRequests = new WeakSet<PayloadRequest>()

function sameUser(left: unknown, right: unknown): boolean {
  return left !== undefined && left !== null && String(left) === String(right)
}

async function countUsers(req: PayloadRequest): Promise<number> {
  const result = await req.payload.count({ collection: 'users', overrideAccess: true, req })
  return result.totalDocs
}

async function countOwners(req: PayloadRequest): Promise<number> {
  const result = await req.payload.count({
    collection: 'users',
    overrideAccess: true,
    req,
    where: { roles: { contains: 'owner' } },
  })
  return result.totalDocs
}

async function readUser(req: PayloadRequest, id: number | string): Promise<unknown> {
  try {
    return await req.payload.findByID({
      collection: 'users',
      depth: 0,
      id,
      overrideAccess: true,
      req,
      select: { roles: true },
    })
  } catch {
    return null
  }
}

function requestedRoles(data: unknown): readonly string[] | undefined {
  if (typeof data !== 'object' || data === null || !('roles' in data)) return undefined
  return Array.isArray(data.roles)
    ? data.roles.filter((role): role is string => typeof role === 'string')
    : []
}

function rejectsOwnerAssignment(data: unknown): boolean {
  return requestedRoles(data)?.includes('owner') ?? false
}

function removesOwner(data: unknown): boolean {
  const roles = requestedRoles(data)
  return roles !== undefined && !roles.includes('owner')
}

function forbid(message: string): never {
  throw new APIError(message, FORBIDDEN)
}

function conflict(message: string): never {
  throw new APIError(message, CONFLICT)
}

export const canCreateUser: Access = async ({ req }) => {
  accessCheckedRequests.add(req)
  if (hasAppRole(req.user, ['owner', 'admin'])) return true
  if (req.user) return false
  return (await countUsers(req)) === 0
}

export const canReadUser: Access = ({ req }) => {
  if (hasAppRole(req.user, ['owner', 'admin'])) return true
  if (!req.user) return false
  return { id: { equals: req.user.id } }
}

export const canUpdateUser: Access = async ({ id, req }) => {
  accessCheckedRequests.add(req)
  if (hasAppRole(req.user, ['owner'])) return true

  if (hasAppRole(req.user, ['admin'])) {
    if (id === undefined || id === null) return true
    return !hasAppRole(await readUser(req, id), ['owner'])
  }

  return sameUser(req.user?.id, id)
}

export const canDeleteUser: Access = async ({ id, req }) => {
  accessCheckedRequests.add(req)
  if (hasAppRole(req.user, ['owner'])) return true
  if (!hasAppRole(req.user, ['admin'])) return false
  if (id === undefined || id === null) return true
  return !hasAppRole(await readUser(req, id), ['owner'])
}

export const canSetUserRoles: FieldAccess = ({ doc, req }) => {
  if (hasAppRole(req.user, ['owner'])) return true
  return hasAppRole(req.user, ['admin']) && !hasAppRole(doc, ['owner'])
}

export const guardUserChange: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const actorIsOwner = hasAppRole(req.user, ['owner'])
  const actorIsAdmin = hasAppRole(req.user, ['admin'])

  if (operation === 'create') {
    const userCount = await countUsers(req)

    if (userCount === 0) {
      data.roles = ['owner']
      return data
    }

    if (!req.user) {
      if (accessCheckedRequests.has(req)) {
        forbid('The owner bootstrap has already been completed.')
      }
      return data
    }
    if (!actorIsOwner && !actorIsAdmin) forbid('Only owners and admins can create users.')
    if (!actorIsOwner && rejectsOwnerAssignment(data)) {
      forbid('Only an owner can assign the owner role.')
    }

    return data
  }

  const targetIsOwner = hasAppRole(originalDoc, ['owner'])

  if (actorIsAdmin && (targetIsOwner || rejectsOwnerAssignment(data))) {
    forbid('Admins cannot modify owners or assign the owner role.')
  }

  if (
    accessCheckedRequests.has(req) &&
    !actorIsOwner &&
    !actorIsAdmin &&
    requestedRoles(data) !== undefined
  ) {
    forbid('Users cannot change their own application roles.')
  }

  if (targetIsOwner && removesOwner(data) && (await countOwners(req)) <= 1) {
    conflict('At least one owner account must remain.')
  }

  return data
}

export const guardUserDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const target = await readUser(req, id)
  if (!hasAppRole(target, ['owner'])) return

  if (hasAppRole(req.user, ['admin']) && !hasAppRole(req.user, ['owner'])) {
    forbid('Admins cannot delete owners.')
  }

  if ((await countOwners(req)) <= 1) {
    conflict('At least one owner account must remain.')
  }
}
