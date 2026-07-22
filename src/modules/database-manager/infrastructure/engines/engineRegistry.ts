import type { DatabaseEngine, EngineId } from '../../domain/contracts'
import { ManagerError } from '../../domain/errors'
import { MysqlEngine } from '../mysql/MysqlEngine'
import { PostgresEngine } from '../postgresql/PostgresEngine'

type EngineRegistry = {
  readonly [Id in EngineId]: DatabaseEngine & { readonly id: Id }
}

const engines = {
  mysql: new MysqlEngine(),
  postgresql: new PostgresEngine(),
} satisfies EngineRegistry

export function getDatabaseEngine(id: EngineId): DatabaseEngine {
  const engine: DatabaseEngine | undefined = engines[id]
  if (!engine) throw new ManagerError('ENGINE_NOT_SUPPORTED', `Engine ${id} is not supported.`, 400)
  return engine
}
