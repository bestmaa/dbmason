import type { Endpoint } from 'payload'

import { managerService } from '../application/managerService'
import {
  getRouteParam,
  handleEndpoint,
  jsonResponse,
  requireAuthenticated,
} from './endpointSupport'

export const observabilityEndpoints: readonly Endpoint[] = [
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireAuthenticated(req)
        const connectionId = getRouteParam(req, 'connectionId')
        return jsonResponse(await managerService.getObservability(req, connectionId))
      }),
    method: 'get',
    path: '/db-manager/v1/connections/:connectionId/observability',
  },
]
