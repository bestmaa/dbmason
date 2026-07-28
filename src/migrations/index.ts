import * as migration_20260720_095859_initial from './20260720_095859_initial'
import * as migration_20260728_115052_add_two_factor_auth from './20260728_115052_add_two_factor_auth'
import * as migration_20260728_173241_add_external_connection_endpoint from './20260728_173241_add_external_connection_endpoint'

export const migrations = [
  {
    up: migration_20260720_095859_initial.up,
    down: migration_20260720_095859_initial.down,
    name: '20260720_095859_initial',
  },
  {
    up: migration_20260728_115052_add_two_factor_auth.up,
    down: migration_20260728_115052_add_two_factor_auth.down,
    name: '20260728_115052_add_two_factor_auth',
  },
  {
    up: migration_20260728_173241_add_external_connection_endpoint.up,
    down: migration_20260728_173241_add_external_connection_endpoint.down,
    name: '20260728_173241_add_external_connection_endpoint',
  },
]
