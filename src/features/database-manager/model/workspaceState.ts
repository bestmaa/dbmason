export type WorkspaceState = 'empty' | 'error' | 'loading' | 'ready'

interface WorkspaceStateInput {
  error: string | null
  hasConnections: boolean
  hasSelectedConnection: boolean
  hasSnapshot: boolean
  loading: boolean
}

export function resolveWorkspaceState(input: WorkspaceStateInput): WorkspaceState {
  if (input.loading) return 'loading'
  if (input.error && !input.hasSnapshot) return 'error'
  if (!input.hasConnections) return 'empty'
  if (input.hasSelectedConnection && !input.hasSnapshot) return 'loading'
  return 'ready'
}
