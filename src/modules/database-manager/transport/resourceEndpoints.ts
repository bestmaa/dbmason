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
import {
  createDatabaseSchema,
  createPrincipalSchema,
  principalRouteSchema,
  revokePrincipalAccessSchema,
  setPrincipalAccessSchema,
  setPrincipalLoginSchema,
} from './schemas'

const operators = ['owner', 'admin', 'operator'] as const

export const resourceEndpoints: readonly Endpoint[] = [
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireAuthenticated(req)
        const connectionId = getRouteParam(req, 'connectionId')
        const { principal } = principalRouteSchema.parse({
          principal: getRouteParam(req, 'principal'),
        })
        return jsonResponse(
          await managerService.getPrincipalAccess(req, connectionId, principal),
        )
      }),
    method: 'get',
    path: '/db-manager/v1/connections/:connectionId/principals/:principal/access',
  },
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireAuthenticated(req)
        const connectionId = getRouteParam(req, 'connectionId')
        const snapshot = await managerService.getSnapshot(req, connectionId)
        return jsonResponse(snapshot)
      }),
    method: 'get',
    path: '/db-manager/v1/connections/:connectionId/snapshot',
  },
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireRole(req, operators)
        const connectionId = getRouteParam(req, 'connectionId')
        const command = await parseJson(req, createDatabaseSchema)
        await managerService.createDatabase(req, connectionId, command)
        return jsonResponse({ created: true }, 201)
      }),
    method: 'post',
    path: '/db-manager/v1/connections/:connectionId/databases',
  },
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireRole(req, operators)
        const connectionId = getRouteParam(req, 'connectionId')
        const command = await parseJson(req, createPrincipalSchema)
        const credential = await managerService.createPrincipal(req, connectionId, command)
        return jsonResponse(credential, 201)
      }),
    method: 'post',
    path: '/db-manager/v1/connections/:connectionId/principals',
  },
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireRole(req, operators)
        const connectionId = getRouteParam(req, 'connectionId')
        const { principal } = principalRouteSchema.parse({
          principal: getRouteParam(req, 'principal'),
        })
        const input = await parseJson(req, setPrincipalAccessSchema)
        const result = await managerService.setPrincipalAccess(req, connectionId, {
          ...input,
          principal,
        })
        return jsonResponse({ updated: true, warnings: result.warnings })
      }),
    method: 'post',
    path: '/db-manager/v1/connections/:connectionId/principals/:principal/access',
  },
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireRole(req, operators)
        const connectionId = getRouteParam(req, 'connectionId')
        const { principal } = principalRouteSchema.parse({
          principal: getRouteParam(req, 'principal'),
        })
        const input = await parseJson(req, revokePrincipalAccessSchema)
        const result = await managerService.revokePrincipalAccess(req, connectionId, {
          ...input,
          principal,
        })
        return jsonResponse({ revoked: true, warnings: result.warnings })
      }),
    method: 'delete',
    path: '/db-manager/v1/connections/:connectionId/principals/:principal/access',
  },
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireRole(req, operators)
        const connectionId = getRouteParam(req, 'connectionId')
        const { principal } = principalRouteSchema.parse({
          principal: getRouteParam(req, 'principal'),
        })
        const input = await parseJson(req, setPrincipalLoginSchema)
        await managerService.setPrincipalLogin(req, connectionId, { ...input, principal })
        return jsonResponse({ enabled: input.enabled, updated: true })
      }),
    method: 'patch',
    path: '/db-manager/v1/connections/:connectionId/principals/:principal/login',
  },
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireRole(req, operators)
        const connectionId = getRouteParam(req, 'connectionId')
        const { principal } = principalRouteSchema.parse({
          principal: getRouteParam(req, 'principal'),
        })
        const credential = await managerService.rotatePrincipalPassword(req, connectionId, {
          principal,
        })
        return jsonResponse(credential)
      }),
    method: 'post',
    path: '/db-manager/v1/connections/:connectionId/principals/:principal/password',
  },
  {
    handler: (req) =>
      handleEndpoint(async () => {
        requireRole(req, operators)
        const connectionId = getRouteParam(req, 'connectionId')
        const { principal } = principalRouteSchema.parse({
          principal: getRouteParam(req, 'principal'),
        })
        await managerService.dropPrincipal(req, connectionId, { principal })
        return jsonResponse({ dropped: true })
      }),
    method: 'delete',
    path: '/db-manager/v1/connections/:connectionId/principals/:principal',
  },
]
