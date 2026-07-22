import { sqliteAdapter } from '@payloadcms/db-sqlite'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import { AccessProfiles } from './collections/AccessProfiles'
import { AuditEvents } from './collections/AuditEvents'
import { DatabaseConnections } from './collections/DatabaseConnections'
import { Users } from './collections/Users'
import { getServerEnv } from './config/env'
import { migrations } from './migrations'
import { managerEndpoints } from './modules/database-manager/transport/managerEndpoints'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const env = getServerEnv()

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, DatabaseConnections, AccessProfiles, AuditEvents],
  endpoints: managerEndpoints,
  secret: env.PAYLOAD_SECRET,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteAdapter({
    busyTimeout: 5_000,
    client: {
      url: env.DATABASE_URL,
    },
    prodMigrations: migrations,
    transactionOptions: { behavior: 'immediate' },
    wal: {
      journalSizeLimit: 16 * 1024 * 1024,
      synchronous: 'FULL',
    },
  }),
  graphQL: { disable: true },
  plugins: [],
})
