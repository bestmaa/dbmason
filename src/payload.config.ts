import { sqliteAdapter } from '@payloadcms/db-sqlite'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import { AccessProfiles } from './collections/AccessProfiles'
import { AuditEvents } from './collections/AuditEvents'
import { DatabaseConnections } from './collections/DatabaseConnections'
import { createUsersCollection } from './collections/Users'
import { getServerEnv } from './config/env'
import { migrations } from './migrations'
import { managerEndpoints } from './modules/database-manager/transport/managerEndpoints'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const env = getServerEnv()
const publicOrigin = env.DBMASON_PUBLIC_URL
const Users = createUsersCollection({ secureCookies: publicOrigin.startsWith('https://') })

export default buildConfig({
  admin: {
    avatar: 'default',
    components: {
      beforeNav: [
        '/features/admin-shell/connectors/AdminNavConnector#AdminNavBrandConnector',
      ],
      beforeNavLinks: [
        '/features/admin-shell/connectors/AdminNavConnector#AdminNavLinksConnector',
      ],
      graphics: {
        Icon: '/features/admin-shell/ui/DBMasonIcon#DBMasonIcon',
        Logo: '/features/admin-shell/ui/DBMasonLogo#DBMasonLogo',
      },
      views: {
        createFirstUser: {
          Component: '/auth/two-factor/TwoFactorBootstrapView#TwoFactorBootstrapView',
        },
        dashboard: {
          Component:
            '/features/admin-shell/connectors/AdminDashboardConnector#AdminDashboardConnector',
        },
        login: {
          Component: '/auth/two-factor/TwoFactorLoginView#TwoFactorLoginView',
        },
      },
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      applicationName: 'DBMason',
      defaultOGImageType: 'off',
      description: 'DBMason database access control center.',
      icons: {
        icon: [{ type: 'image/svg+xml', url: '/dbmason-mark.svg' }],
        shortcut: '/dbmason-mark.svg',
      },
      openGraph: {
        description: 'A self-hosted database access control plane.',
        siteName: 'DBMason',
        title: 'DBMason control center',
      },
      robots: {
        follow: false,
        index: false,
      },
      titleSuffix: '· DBMason',
    },
    theme: 'dark',
    user: Users.slug,
  },
  collections: [Users, DatabaseConnections, AccessProfiles, AuditEvents],
  cors: [publicOrigin],
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
  // Payload derives its cookie-CSRF allowlist from this exact origin during config sanitization.
  serverURL: publicOrigin,
  telemetry: false,
})
