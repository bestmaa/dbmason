import type { Endpoint } from 'payload'

import { managerService } from '../application/managerService'
import {
  getRouteParam,
  handleEndpoint,
  jsonResponse,
  parseBoundedJson,
  requireRole,
} from './endpointSupport'
import {
  browseWorkspaceRelationSchema,
  loadWorkspaceCatalogSchema,
  runWorkspaceQuerySchema,
} from './workspaceSchemas'

const operators = ['owner', 'admin', 'operator'] as const
const maximumWorkspaceBodyBytes = 262_144

export const workspaceEndpoints: readonly Endpoint[] = [
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireRole(req, operators)
        const connectionId = getRouteParam(req, 'connectionId')
        const command = await parseBoundedJson(
          req,
          loadWorkspaceCatalogSchema,
          maximumWorkspaceBodyBytes,
        )
        return jsonResponse(await managerService.loadWorkspaceCatalog(req, connectionId, command))
      }),
    method: 'post',
    path: '/db-manager/v1/connections/:connectionId/workspace/catalog',
  },
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireRole(req, operators)
        const connectionId = getRouteParam(req, 'connectionId')
        const command = await parseBoundedJson(
          req,
          browseWorkspaceRelationSchema,
          maximumWorkspaceBodyBytes,
        )
        return jsonResponse(
          await managerService.browseWorkspaceRelation(req, connectionId, command),
        )
      }),
    method: 'post',
    path: '/db-manager/v1/connections/:connectionId/workspace/rows',
  },
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireRole(req, operators)
        const connectionId = getRouteParam(req, 'connectionId')
        const command = await parseBoundedJson(
          req,
          runWorkspaceQuerySchema,
          maximumWorkspaceBodyBytes,
        )
        return jsonResponse(
          await managerService.runWorkspaceReadOnlyQuery(req, connectionId, command),
        )
      }),
    method: 'post',
    path: '/db-manager/v1/connections/:connectionId/workspace/query',
  },
]
