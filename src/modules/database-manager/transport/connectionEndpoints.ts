import type { Endpoint } from 'payload'

import { managerService } from '../application/managerService'
import {
  getRouteParam,
  handleEndpoint,
  jsonResponse,
  parseJson,
  requireAuthenticated,
  requireRole,
} from './endpointSupport'
import { createConnectionSchema, updateExternalEndpointSchema } from './schemas'

const operators = ['owner', 'admin', 'operator'] as const
const connectionAdministrators = ['owner', 'admin'] as const

export const connectionEndpoints: readonly Endpoint[] = [
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireRole(req, connectionAdministrators)
        const connectionId = getRouteParam(req, 'connectionId')
        const input = await parseJson(req, updateExternalEndpointSchema)
        const connection = await managerService.updateExternalEndpoint(req, connectionId, input)
        return jsonResponse({ connection })
      }),
    method: 'patch',
    path: '/db-manager/v1/connections/:connectionId/endpoint',
  },
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireAuthenticated(req)
        return jsonResponse({ connections: await managerService.listConnections(req) })
      }),
    method: 'get',
    path: '/db-manager/v1/connections',
  },
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireRole(req, operators)
        const input = await parseJson(req, createConnectionSchema)
        const connection = await managerService.createConnection(req, input)
        return jsonResponse({ connection }, 201)
      }),
    method: 'post',
    path: '/db-manager/v1/connections',
  },
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireRole(req, operators)
        const connectionId = getRouteParam(req, 'connectionId')
        const result = await managerService.testConnection(req, connectionId)
        return jsonResponse(result)
      }),
    method: 'post',
    path: '/db-manager/v1/connections/:connectionId/test',
  },
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireRole(req, connectionAdministrators)
        const connectionId = getRouteParam(req, 'connectionId')
        await managerService.deleteSavedConnection(req, connectionId)
        return jsonResponse({ deleted: true, remoteServerChanged: false })
      }),
    method: 'delete',
    path: '/db-manager/v1/connections/:connectionId',
  },
]
