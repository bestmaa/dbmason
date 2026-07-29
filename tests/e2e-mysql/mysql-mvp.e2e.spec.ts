import { expect, test } from '@playwright/test'

import { loginWithTwoFactor } from '../helpers/twoFactorLogin'
import {
  cleanupRemoteResources,
  readSeededLabels,
  readTestMySQLSettings,
  remoteDatabaseExists,
  remoteResources,
  seedReadableTable,
  verifyLoginRejected,
  verifyReadOnlyLogin,
  verifySelectAccess,
  verifyWritableLogin,
} from './mysqlHarness'

const owner = {
  email: 'mysql-e2e-owner@dbmason.test',
  name: 'MySQL E2E Owner',
  password: 'MySQL_E2E_Owner_only_2026!',
} as const
const viewer = {
  email: 'mysql-e2e-viewer@dbmason.test',
  name: 'MySQL E2E Viewer',
  password: 'MySQL_E2E_Viewer_only_2026!',
} as const
const connectionName = 'Isolated MySQL 8.4 E2E'

function readConnectionId(value: unknown): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('connection' in value) ||
    typeof value.connection !== 'object' ||
    value.connection === null ||
    !('id' in value.connection) ||
    typeof value.connection.id !== 'string'
  ) {
    throw new Error('Connection creation returned an invalid identifier.')
  }
  return value.connection.id
}

function readRequestEngine(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('engine' in value)) return null
  return typeof value.engine === 'string' ? value.engine : null
}

test.describe.serial('MySQL MVP through Chromium', () => {
  let connectionId = ''
  let currentPassword = ''

  test.beforeAll(async () => {
    await cleanupRemoteResources()
  })

  test.afterAll(async () => {
    await cleanupRemoteResources()
  })

  test('bootstraps an owner and sends an explicit MySQL connection', async ({ page }) => {
    const mysql = readTestMySQLSettings()

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Secure your control plane' })).toBeVisible()
    await page.getByRole('link', { name: 'Create owner account' }).click()
    await page.locator('#field-name').fill(owner.name)
    await page.locator('#field-email').fill(owner.email)
    await page.locator('#field-password').fill(owner.password)
    await page.locator('#field-confirm-password').fill(owner.password)
    await page
      .locator('form')
      .getByRole('button', { name: /create/i })
      .click()
    await expect(page).toHaveURL(/\/login/u)
    await loginWithTwoFactor(page, owner)

    await expect(page.locator('.identity')).toContainText(owner.email)
    await page.locator('.connection-rail').getByRole('button', { name: 'Add connection' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add connection' })
    await dialog.getByLabel('Database engine').selectOption('mysql')
    await expect(dialog.getByLabel('Port')).toHaveValue('3306')
    await expect(dialog.getByLabel('Maintenance database')).toHaveValue('mysql')
    await expect(dialog.getByLabel('Admin username')).toHaveValue('root')
    await dialog.getByLabel('Connection name').fill(connectionName)
    await dialog.getByLabel('Host').fill(mysql.host)
    await dialog.getByLabel('Port').fill(String(mysql.port))
    await dialog.getByLabel('Maintenance database').fill(mysql.database)
    await dialog.getByLabel('Admin username').fill(mysql.user)
    await dialog.getByLabel('TLS mode').selectOption('disable')
    await dialog.getByLabel('Admin password').fill(mysql.password)

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/db-manager/v1/connections') &&
        response.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: 'Test & save' }).click()
    const response = await responsePromise
    expect(response.status()).toBe(201)
    expect(readRequestEngine(response.request().postDataJSON() as unknown)).toBe('mysql')
    connectionId = readConnectionId((await response.json()) as unknown)

    await expect(page.getByRole('heading', { name: connectionName })).toBeVisible()
    await expect(page.locator('.workspace-title')).toContainText('MySQL')
    await expect(page.getByRole('row', { name: new RegExp(mysql.database, 'u') })).toBeVisible()
    await expect(page.getByText('PUBLIC grants', { exact: true })).toHaveCount(0)
  })

  test('creates a database and canonical read-only MySQL account', async ({ page }) => {
    await loginWithTwoFactor(page, owner)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: connectionName })).toBeVisible()
    await page.getByRole('button', { name: 'Database', exact: true }).click()
    const databaseDialog = page.getByRole('dialog', { name: 'Create database' })
    await expect(databaseDialog.getByLabel(/Owner/u)).toHaveCount(0)
    await expect(databaseDialog).toContainText('server default character set and collation')
    await databaseDialog.getByLabel('Database name').fill(remoteResources.database)
    await databaseDialog.getByRole('button', { name: 'Create database' }).click()
    await expect(
      page.getByRole('row', { name: new RegExp(remoteResources.database, 'u') }),
    ).toBeVisible()
    await seedReadableTable()

    await page.getByRole('button', { name: 'Create user' }).click()
    const principalDialog = page.getByRole('dialog', { name: 'Create database account' })
    await expect(principalDialog).toContainText('MySQL account')
    await expect(principalDialog).not.toContainText('PostgreSQL PUBLIC')
    await principalDialog.getByLabel('Username').fill(remoteResources.account)
    await principalDialog.getByLabel('Database access').selectOption(remoteResources.database)
    await principalDialog.getByLabel('Access preset').selectOption('read')
    await principalDialog.getByRole('button', { name: 'Create user' }).click()

    const credentialDialog = page.getByRole('dialog', { name: 'Password ready' })
    await expect(credentialDialog).toContainText('network policy')
    const oneTimePassword = await credentialDialog.locator('.credential-secret code').textContent()
    if (!oneTimePassword) throw new Error('The one-time password was not displayed.')
    currentPassword = oneTimePassword
    await credentialDialog.getByRole('button', { name: 'I saved it' }).click()

    const verification = await verifyReadOnlyLogin(oneTimePassword)
    expect(verification.currentAccount).toBe(remoteResources.account)
    expect(verification.selectedLabel).toBe('visible to the read-only MySQL E2E account')
    expect(verification.insertDenied).toBe(true)
  })

  test('loads MySQL observability and enforces the guarded SQL workspace', async ({ page }) => {
    await loginWithTwoFactor(page, owner)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: connectionName })).toBeVisible()

    const metricsResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/connections/${connectionId}/observability`),
    )
    await page.getByRole('tab', { name: /Observability/u }).click()
    expect((await metricsResponse).status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Observability' })).toBeVisible()
    await expect(page.getByText('Host CPU and RAM', { exact: true })).toBeVisible()
    await expect(page.getByText(/pg_stat_io/u)).toHaveCount(0)
    await expect(
      page.getByRole('row', { name: new RegExp(remoteResources.database, 'u') }),
    ).toBeVisible()

    await page.getByRole('tab', { name: /Data & SQL/u }).click()
    await expect(
      page.getByRole('heading', { name: 'Connect a restricted MySQL account' }),
    ).toBeVisible()
    const credentialGate = page.locator('.workspace-gate')
    await credentialGate.getByLabel('Database').selectOption(remoteResources.database)
    await credentialGate.getByLabel('Restricted account').selectOption(remoteResources.account)
    await credentialGate.getByLabel('Account password').fill(currentPassword)
    const catalogResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/connections/${connectionId}/workspace/catalog`),
    )
    await page.getByRole('button', { name: 'Open read-only workspace' }).click()
    expect((await catalogResponse).status()).toBe(200)
    await expect(page.getByRole('button', { name: 'Disconnect & forget password' })).toBeVisible()

    const relationButton = page.locator(
      `button[data-schema="${remoteResources.database}"][data-relation="${remoteResources.table}"]`,
    )
    await expect(relationButton).toBeVisible()
    const rowsResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/connections/${connectionId}/workspace/rows`),
    )
    await relationButton.click()
    expect((await rowsResponse).status()).toBe(200)
    await expect(page.locator('.workspace-results')).toContainText(
      'visible to the read-only MySQL E2E account',
    )

    const editor = page.getByLabel('Read-only SQL query')
    await editor.fill(
      `SELECT id, label FROM \`${remoteResources.database}\`.\`${remoteResources.table}\` ORDER BY id`,
    )
    const queryResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/connections/${connectionId}/workspace/query`),
    )
    await page.getByRole('button', { name: 'Run query' }).click()
    expect((await queryResponse).status()).toBe(200)
    await expect(page.locator('.workspace-results')).toContainText(
      'visible to the read-only MySQL E2E account',
    )

    await editor.fill(
      `UPDATE \`${remoteResources.database}\`.\`${remoteResources.table}\` SET label = 'forbidden' WHERE id = 1`,
    )
    const blockedResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/connections/${connectionId}/workspace/query`),
    )
    await page.getByRole('button', { name: 'Run query' }).click()
    expect([403, 409]).toContain((await blockedResponse).status())
    await expect(page.locator('.workspace-inline-error')).toContainText(
      /cannot read this resource|read-only/u,
    )
    expect(await readSeededLabels()).toEqual(['visible to the read-only MySQL E2E account'])

    await page.reload()
    await page.getByRole('tab', { name: /Data & SQL/u }).click()
    await expect(page.getByLabel('Account password')).toHaveValue('')
  })

  test('keeps duplicate failures inside the active dialog', async ({ page }) => {
    await loginWithTwoFactor(page, owner)
    await page.goto('/')
    await page.getByRole('button', { name: 'Database', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Create database' })
    await dialog.getByLabel('Database name').fill(remoteResources.database)
    await dialog.getByRole('button', { name: 'Create database' }).click()
    await expect(dialog.getByRole('alert')).toBeVisible()
    await expect(dialog.getByRole('alert')).toContainText(/already exists/u)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('keeps viewers read-only at both UI and API boundaries', async ({ browser, page }) => {
    await loginWithTwoFactor(page, owner)
    const createViewer = await page.evaluate(async (newViewer) => {
      const response = await fetch('/api/users', {
        body: JSON.stringify({ ...newViewer, roles: ['viewer'] }),
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      return response.status
    }, viewer)
    expect(createViewer).toBe(201)

    const viewerContext = await browser.newContext()
    const viewerPage = await viewerContext.newPage()
    try {
      await loginWithTwoFactor(viewerPage, viewer)
      await viewerPage.goto('/')
      await expect(viewerPage.getByRole('heading', { name: connectionName })).toBeVisible()
      await expect(viewerPage.getByRole('button', { name: 'Add connection' })).toHaveCount(0)
      await expect(viewerPage.getByRole('button', { name: 'Database', exact: true })).toHaveCount(0)
      await expect(viewerPage.getByRole('button', { name: 'Create user' })).toHaveCount(0)
      await expect(viewerPage.getByRole('tab', { name: /Data & SQL/u })).toHaveCount(0)

      const metricsResponse = viewerPage.waitForResponse((response) =>
        response.url().endsWith(`/connections/${connectionId}/observability`),
      )
      await viewerPage.getByRole('tab', { name: /Observability/u }).click()
      expect((await metricsResponse).status()).toBe(200)

      const workspaceStatus = await viewerPage.evaluate(
        async ({ database, id, principal }) => {
          const response = await fetch(`/api/db-manager/v1/connections/${id}/workspace/query`, {
            body: JSON.stringify({
              database,
              maxRows: 1,
              password: 'invalid-viewer-test-credential',
              principal,
              sql: 'SELECT 1',
            }),
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          })
          return response.status
        },
        {
          database: remoteResources.database,
          id: connectionId,
          principal: remoteResources.account,
        },
      )
      expect(workspaceStatus).toBe(403)

      const mutationStatus = await viewerPage.evaluate(
        async ({ id, name }) => {
          const response = await fetch(`/api/db-manager/v1/connections/${id}/databases`, {
            body: JSON.stringify({ name, owner: null }),
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          })
          return response.status
        },
        { id: connectionId, name: 'dbmason_e2e_mysql_forbidden' },
      )
      expect(mutationStatus).toBe(403)
    } finally {
      await viewerContext.close()
    }
  })

  test('manages grants, login, password rotation, and account deletion', async ({ page }) => {
    await loginWithTwoFactor(page, owner)
    await page.goto('/')
    await page.getByRole('tab', { name: /Accounts/u }).click()
    await page.getByRole('button', { name: 'View access for root@%' }).click()
    const protectedDialog = page.getByRole('dialog', { name: 'Access for root@%' })
    await expect(protectedDialog.getByText('Current database access')).toBeVisible()
    await expect(protectedDialog.getByRole('button', { name: 'Apply preset' })).toHaveCount(0)
    await protectedDialog.getByRole('button', { name: 'Close dialog' }).click()
    await page.getByRole('button', { name: `Manage ${remoteResources.account}` }).click()
    let dialog = page.getByRole('dialog', { name: `Manage ${remoteResources.account}` })
    let accessRow = dialog
      .getByRole('table', { name: 'Current access for each database' })
      .getByRole('row', { name: new RegExp(remoteResources.database, 'u') })
    await expect(accessRow).toContainText('Matches Read only')
    await dialog.getByLabel('Database').selectOption(remoteResources.database)
    await dialog.getByLabel('New preset to apply').selectOption('write')
    await dialog.getByRole('button', { name: 'Apply preset' }).click()
    await expect(dialog.getByRole('button', { name: 'Apply preset' })).toBeEnabled()
    await expect(accessRow).toContainText('Matches Read & write')
    await verifyWritableLogin(currentPassword)

    await dialog.getByRole('button', { name: 'Rotate password' }).click()
    const credentialDialog = page.getByRole('dialog', { name: 'Password ready' })
    const rotatedPassword = await credentialDialog.locator('.credential-secret code').textContent()
    if (!rotatedPassword) throw new Error('The rotated one-time password was not displayed.')
    expect(await verifyLoginRejected(currentPassword)).toBe(true)
    currentPassword = rotatedPassword
    expect(await verifySelectAccess(currentPassword)).toBe(true)
    await credentialDialog.getByRole('button', { name: 'I saved it' }).click()

    await page.getByRole('button', { name: `Manage ${remoteResources.account}` }).click()
    dialog = page.getByRole('dialog', { name: `Manage ${remoteResources.account}` })
    await dialog.getByRole('button', { name: 'Disable login' }).click()
    await expect(dialog.getByRole('button', { name: 'Enable login' })).toBeVisible()
    expect(await verifyLoginRejected(currentPassword)).toBe(true)
    await dialog.getByRole('button', { name: 'Enable login' }).click()
    await expect(dialog.getByRole('button', { name: 'Disable login' })).toBeVisible()
    expect(await verifySelectAccess(currentPassword)).toBe(true)

    await dialog.getByLabel('Database').selectOption(remoteResources.database)
    await dialog.getByLabel('New preset to apply').selectOption('connect')
    await dialog.getByRole('button', { name: 'Apply preset' }).click()
    await expect(dialog).toContainText('authentication-only')
    accessRow = dialog
      .getByRole('table', { name: 'Current access for each database' })
      .getByRole('row', { name: new RegExp(remoteResources.database, 'u') })
    await expect(accessRow).toContainText('No direct grant')
    await expect(accessRow).toContainText('No database access')
    expect(await verifySelectAccess(currentPassword)).toBe(false)

    await dialog.getByLabel('New preset to apply').selectOption('read')
    await dialog.getByRole('button', { name: 'Apply preset' }).click()
    await expect(dialog.getByRole('button', { name: 'Apply preset' })).toBeEnabled()
    await expect(accessRow).toContainText('Matches Read only')
    expect(await verifySelectAccess(currentPassword)).toBe(true)
    await dialog.getByRole('button', { name: 'Revoke explicit access' }).click()
    await expect(dialog.getByRole('button', { name: 'Revoke explicit access' })).toBeDisabled()
    expect(await verifySelectAccess(currentPassword)).toBe(false)

    await dialog
      .getByLabel(`Type ${remoteResources.account} to confirm`)
      .fill(remoteResources.account)
    await dialog.getByRole('button', { name: 'Drop account', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(
      page.getByRole('button', { name: `Manage ${remoteResources.account}` }),
    ).toHaveCount(0)
  })

  test('removes only the saved control-plane connection', async ({ page }) => {
    await loginWithTwoFactor(page, owner)
    await page.goto('/')
    await page
      .getByRole('button', {
        exact: true,
        name: `Remove saved connection ${connectionName}`,
      })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Remove saved connection' })
    await dialog.getByLabel(`Type ${connectionName} to confirm`).fill(connectionName)
    await dialog.getByRole('button', { name: 'Remove connection' }).click()
    await expect(page.getByRole('heading', { name: 'Connect your first database' })).toBeVisible()
    expect(await remoteDatabaseExists()).toBe(true)
  })
})
