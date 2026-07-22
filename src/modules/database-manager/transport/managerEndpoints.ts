import type { Endpoint } from 'payload'

import { connectionEndpoints } from './connectionEndpoints'
import { observabilityEndpoints } from './observabilityEndpoints'
import { resourceEndpoints } from './resourceEndpoints'
import { workspaceEndpoints } from './workspaceEndpoints'

export const managerEndpoints: Endpoint[] = [
  ...connectionEndpoints,
  ...resourceEndpoints,
  ...observabilityEndpoints,
  ...workspaceEndpoints,
]
