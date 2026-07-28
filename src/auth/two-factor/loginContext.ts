import { APIError } from 'payload'
import type {
  CollectionBeforeLoginHook,
  CollectionBeforeOperationHook,
  PayloadRequest,
  RequestContext,
} from 'payload'

export type FactorMutation =
  | {
      counter: number
      method: 'totp'
    }
  | {
      remainingRecoveryCodeHashes: string[]
      method: 'recovery'
    }
  | {
      encryptedSecret: string
      lastCounter: number
      method: 'enrollment'
      recoveryCodeHashes: string[]
    }

type PasswordCheckGrant = {
  marker: object
  phase: 'password-check'
}

const serverOnlyMarker = Object.freeze({})
const contextKey = 'dbmasonTwoFactorGrant'

function contextWithGrant(grant: PasswordCheckGrant): RequestContext {
  return { [contextKey]: grant }
}

function readGrant(context: RequestContext): PasswordCheckGrant | null {
  const candidate = context[contextKey]
  if (typeof candidate !== 'object' || candidate === null || !('marker' in candidate)) return null
  if (
    candidate.marker !== serverOnlyMarker ||
    !('phase' in candidate) ||
    candidate.phase !== 'password-check'
  ) {
    return null
  }
  return candidate as PasswordCheckGrant
}

export function passwordCheckContext(): RequestContext {
  return contextWithGrant({ marker: serverOnlyMarker, phase: 'password-check' })
}

export async function applyTwoFactorMutation(
  req: PayloadRequest,
  userId: number | string,
  factorMutation: FactorMutation,
): Promise<unknown> {
  const baseUpdate = {
    twoFactorFailedAttempts: 0,
    twoFactorLockedUntil: null,
  }
  const factorUpdate =
    factorMutation.method === 'enrollment'
      ? {
          twoFactorEnabled: true,
          twoFactorLastCounter: factorMutation.lastCounter,
          twoFactorRecoveryCodeHashes: factorMutation.recoveryCodeHashes,
          twoFactorSecret: factorMutation.encryptedSecret,
        }
      : factorMutation.method === 'recovery'
        ? {
            twoFactorRecoveryCodeHashes: factorMutation.remainingRecoveryCodeHashes,
          }
        : { twoFactorLastCounter: factorMutation.counter }

  return req.payload.update({
    collection: 'users',
    data: { ...baseUpdate, ...factorUpdate },
    id: userId,
    overrideAccess: true,
    req,
  })
}

export const enforceTwoFactorLogin: CollectionBeforeLoginHook = async ({ context, user }) => {
  if (readGrant(context)?.phase === 'password-check') return user
  throw new APIError('Two-factor authentication is required.', 401)
}

export const enforceTwoFactorAuthOperation: CollectionBeforeOperationHook = ({
  context,
  operation,
}) => {
  if (operation === 'login' && readGrant(context)?.phase !== 'password-check') {
    throw new APIError('Two-factor authentication is required.', 401)
  }
  if (operation === 'resetPassword') {
    throw new APIError('Two-factor authentication is required.', 401)
  }
}
