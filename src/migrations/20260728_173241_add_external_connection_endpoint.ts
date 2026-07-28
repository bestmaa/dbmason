import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`database_connections\` ADD \`external_host\` text;`)
  await db.run(sql`ALTER TABLE \`database_connections\` ADD \`external_port\` numeric;`)
  await db.run(sql`ALTER TABLE \`database_connections\` ADD \`external_ssl_mode\` text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`database_connections\` DROP COLUMN \`external_host\`;`)
  await db.run(sql`ALTER TABLE \`database_connections\` DROP COLUMN \`external_port\`;`)
  await db.run(sql`ALTER TABLE \`database_connections\` DROP COLUMN \`external_ssl_mode\`;`)
}
