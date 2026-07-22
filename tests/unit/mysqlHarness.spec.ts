import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

function projectFile(relativePath: string): string {
  return readFileSync(path.resolve(relativePath), 'utf8')
}

describe('MySQL test harness isolation', () => {
  it('pins MySQL 8.4 and publishes only on loopback', () => {
    const compose = projectFile('docker-compose.mysql-test.yml')

    expect(compose).toContain(
      'image: mysql:8.4.10@sha256:c592c15aaf4a1961e15d82eb31ea5987dda862d1c4b1e93424438c0e91dc1f8d',
    )
    expect(compose).toContain("'127.0.0.1:${MYSQL_TEST_PORT:-53306}:3306'")
    expect(compose).not.toContain('0.0.0.0')
    expect(compose).toContain('com.dbmason.engine: mysql')
    expect(compose).not.toContain('postgres-test')
  })

  it('uses a dedicated Compose project and refuses a missing local environment file', () => {
    const wrapper = projectFile('scripts/mysql-test-compose.mjs')

    expect(wrapper).toContain("const projectName = 'dbmason-mysql-test'")
    expect(wrapper).toContain("const envFile = path.join(repoRoot, '.env.mysql-test')")
    expect(wrapper).toContain('Missing .env.mysql-test')
    expect(wrapper).toContain("['down', '--volumes', '--remove-orphans']")
  })

  it('keeps MySQL integration and browser state separate from PostgreSQL', () => {
    const integration = projectFile('vitest.mysql.config.mts')
    const playwright = projectFile('playwright.mysql.config.ts')
    const preparer = projectFile('scripts/prepare-mysql-e2e.mjs')
    const starter = projectFile('scripts/start-mysql-e2e-app.mjs')

    expect(integration).toContain('data/mysql-integration-control-plane.db')
    expect(integration).toContain('tests/mysql/**/*.mysql.spec.ts')
    expect(playwright).toContain("testDir: './tests/e2e-mysql'")
    expect(playwright).toContain('DBMASON_MYSQL_E2E_PORT')
    expect(starter).toContain("NEXT_DIST_DIR: '.next-e2e-mysql'")
    expect(preparer).toContain('data/${databaseBasename}')
    expect(preparer).toContain("const databaseBasename = 'mysql-e2e-control-plane.db'")
  })

  it('checks in only a test-only example and ignores the local credential file', () => {
    const example = projectFile('.env.mysql-test.example')
    const gitignore = projectFile('.gitignore')

    expect(example).toContain('TEST ONLY')
    expect(example).toContain('MYSQL_TEST_HOST=127.0.0.1')
    expect(example).toContain('MYSQL_TEST_DATABASE=dbmason_manager_test')
    expect(gitignore).toContain('.env.mysql-test')
    expect(gitignore).toContain('/.next-e2e-mysql/')
  })
})
