import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`users\` ADD \`two_factor_enabled\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`two_factor_secret\` text;`)
  await db.run(
    sql`ALTER TABLE \`users\` ADD \`two_factor_recovery_code_hashes\` text DEFAULT '[]';`,
  )
  await db.run(sql`ALTER TABLE \`users\` ADD \`two_factor_last_counter\` numeric;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`two_factor_failed_attempts\` numeric DEFAULT 0;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`two_factor_locked_until\` text;`)

  // Tokens issued before this migration have not passed 2FA. Removing their
  // backing sessions makes every existing login fail closed after deployment.
  await db.run(sql`DELETE FROM \`users_sessions\`;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`two_factor_enabled\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`two_factor_secret\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`two_factor_recovery_code_hashes\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`two_factor_last_counter\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`two_factor_failed_attempts\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`two_factor_locked_until\`;`)
}
