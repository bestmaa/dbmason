import type { CollectionBeforeOperationHook } from 'payload'
import { ValidationError } from 'payload'

export const minimumApplicationPasswordLength = 12

function readSuppliedPassword(data: unknown): { supplied: boolean; value: unknown } {
  if (typeof data !== 'object' || data === null || !('password' in data)) {
    return { supplied: false, value: undefined }
  }

  return { supplied: true, value: data.password }
}

export const enforceUserPasswordPolicy: CollectionBeforeOperationHook = (hookArgs) => {
  if (
    hookArgs.operation !== 'create' &&
    hookArgs.operation !== 'update' &&
    hookArgs.operation !== 'resetPassword'
  ) {
    return
  }

  const password = readSuppliedPassword(hookArgs.args.data)
  if (!password.supplied) return
  if (
    typeof password.value === 'string' &&
    password.value.length >= minimumApplicationPasswordLength
  ) {
    return
  }

  throw new ValidationError({
    collection: hookArgs.collection.slug,
    errors: [
      {
        message: `Password must be at least ${minimumApplicationPasswordLength} characters.`,
        path: 'password',
      },
    ],
    req: hookArgs.req,
  })
}
