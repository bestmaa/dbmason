import type { DatabaseEngine, EngineId } from '../../domain/contracts'
import { ManagerError } from '../../domain/errors'
import { PostgresEngine } from '../postgresql/PostgresEngine'

const engines = new Map<EngineId, DatabaseEngine>([['postgresql', new PostgresEngine()]])

export function getDatabaseEngine(id: EngineId): DatabaseEngine {
  const engine = engines.get(id)
  if (!engine) throw new ManagerError('ENGINE_NOT_SUPPORTED', `Engine ${id} is not supported.`, 400)
  return engine
}
