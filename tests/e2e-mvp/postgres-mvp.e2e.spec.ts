import { expect, test } from '@playwright/test'

import {
  disableTwoFactorForTest,
  enableTwoFactorForTest,
  loginWithTwoFactor,
} from '../helpers/twoFactorLogin'
import {
  cleanupRemoteResources,
  readSeededLabels,
  readTestPostgresSettings,
  remoteDatabaseExists,
  remoteResources,
  seedReadableTable,
  verifyLoginRejected,
  verifyReadOnlyLogin,
  verifySelectAccess,
  verifyWritableLogin,
} from './postgresHarness'

const owner = {
  email: 'e2e-owner@db-control.test',
  name: 'E2E Owner',
  password: 'E2E_Owner_only_2026!',
} as const
const viewer = {
  email: 'e2e-viewer@db-control.test',
  name: 'E2E Viewer',
  password: 'E2E_Viewer_only_2026!',
} as const
const connectionName = 'Isolated PostgreSQL E2E'

test.describe.serial('PostgreSQL MVP through Chromium', () => {
  let connectionId = ''
  let currentPassword = ''

  test.beforeAll(async () => {
    await cleanupRemoteResources()
  })

  test.afterAll(async () => {
    await cleanupRemoteResources()
  })

  test('bootstraps the first owner and saves the isolated PostgreSQL connection', async ({
    page,
  }) => {
    const postgres = readTestPostgresSettings()

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Secure your control plane' })).toBeVisible()
    await page.getByRole('link', { name: 'Create owner account' }).click()

    await expect(page.locator('#field-email')).toBeVisible()
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
    await dialog.getByLabel('Connection name').fill(connectionName)
    await dialog.getByLabel('Host').fill(postgres.host)
    await dialog.getByLabel('Port').fill(String(postgres.port))
    await dialog.getByLabel('Maintenance database').fill(postgres.database)
    await dialog.getByLabel('Admin username').fill(postgres.user)
    await dialog.getByLabel('TLS mode').selectOption('disable')
    await dialog.getByLabel('Admin password').fill(postgres.password)

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/db-manager/v1/connections') &&
        response.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: 'Test & save' }).click()
    const response = await responsePromise
    expect(response.status()).toBe(201)
    const body: unknown = await response.json()
    if (
      typeof body !== 'object' ||
      body === null ||
      !('connection' in body) ||
      typeof body.connection !== 'object' ||
      body.connection === null ||
      !('id' in body.connection) ||
      typeof body.connection.id !== 'string'
    ) {
      throw new Error('Connection creation returned an invalid identifier.')
    }
    connectionId = body.connection.id

    await expect(page.getByRole('heading', { name: connectionName })).toBeVisible()
    const publicRow = page.getByRole('row', { name: new RegExp(postgres.database, 'u') })
    await expect(publicRow).toContainText('CONNECT')
    await expect(publicRow).toContainText('TEMPORARY')
  })

  test('creates a database and a role whose one-time password is read-only', async ({ page }) => {
    await loginWithTwoFactor(page, owner)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: connectionName })).toBeVisible()
    await page.getByRole('button', { name: 'Database', exact: true }).click()

    const databaseDialog = page.getByRole('dialog', { name: 'Create database' })
    await databaseDialog.getByLabel('Database name').fill(remoteResources.database)
    await databaseDialog.getByRole('button', { name: 'Create database' }).click()
    await expect(
      page.getByRole('row', { name: new RegExp(remoteResources.database, 'u') }),
    ).toBeVisible()
    await seedReadableTable()

    await page.getByRole('button', { name: 'Create user' }).click()
    const principalDialog = page.getByRole('dialog', { name: 'Create database user' })
    await expect(principalDialog).toContainText('Additive access')
    await expect(principalDialog).toContainText('PUBLIC')
    await principalDialog.getByLabel('Username').fill(remoteResources.principal)
    await principalDialog.getByLabel('Database access').selectOption(remoteResources.database)
    await principalDialog.getByLabel('Access preset').selectOption('read')
    await principalDialog.getByRole('button', { name: 'Create user' }).click()

    const credentialDialog = page.getByRole('dialog', { name: 'Password ready' })
    const oneTimePassword = await credentialDialog.locator('.credential-secret code').textContent()
    if (!oneTimePassword) throw new Error('The one-time password was not displayed.')
    currentPassword = oneTimePassword
    await credentialDialog.getByRole('button', { name: 'I saved it' }).click()

    const verification = await verifyReadOnlyLogin(oneTimePassword)
    expect(verification.selectedLabel).toBe('visible to the read-only E2E role')
    expect(verification.insertDenied).toBe(true)

    await page.reload()
    await expect(page.getByRole('heading', { name: connectionName })).toBeVisible()
    await expect(
      page.getByRole('row', { name: new RegExp(remoteResources.database, 'u') }),
    ).toBeVisible()
  })

  test('lets the owner opt in to 2FA and later return to password-only login', async ({ page }) => {
    await loginWithTwoFactor(page, owner)
    await enableTwoFactorForTest(page, owner)

    await loginWithTwoFactor(page, owner)
    await expect(page.locator('.identity')).toContainText(owner.email)
    await disableTwoFactorForTest(page, owner)

    await loginWithTwoFactor(page, owner)
    await expect(page.locator('#field-two-factor-code')).toHaveCount(0)
    await expect(page.locator('.identity')).toContainText(owner.email)
  })

  test('shows safe per-database connection URLs without revealing the saved administrator secret', async ({
    page,
  }) => {
    const postgres = readTestPostgresSettings()
    await loginWithTwoFactor(page, owner)
    await page.goto('/')
    await page
      .getByRole('button', {
        name: `Connection details for ${remoteResources.database}`,
        exact: true,
      })
      .click()

    const dialog = page.getByRole('dialog', { name: 'Database connection details' })
    await expect(dialog).toContainText(`${postgres.host}:${postgres.port}`)
    await expect(dialog).toContainText(
      `postgresql://${remoteResources.principal}:PASSWORD@${postgres.host}:${postgres.port}/${remoteResources.database}`,
    )
    await expect(dialog).not.toContainText(postgres.password)

    const password = dialog.getByLabel(/Password/u)
    await password.fill(currentPassword)
    await dialog.getByLabel('External hostname or IP').fill('db.example.test')
    await expect(password).toHaveValue('')
    await dialog.getByLabel('External port').fill('6543')
    await dialog.getByLabel('TLS mode').selectOption('require')
    await dialog.getByRole('button', { name: 'Save external' }).click()

    await expect(dialog).toContainText('db.example.test:6543')
    await expect(dialog).toContainText(
      `postgresql://${remoteResources.principal}:PASSWORD@db.example.test:6543/${remoteResources.database}`,
    )
  })

  test('shows live observability and runs the guarded read-only workspace', async ({ page }) => {
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
    await expect(page.getByText(/external metrics provider/u)).toBeVisible()
    await expect(
      page.getByRole('row', { name: new RegExp(remoteResources.database, 'u') }),
    ).toBeVisible()

    await page.getByRole('tab', { name: /Data & SQL/u }).click()
    await expect(
      page.getByRole('heading', { name: 'Connect a restricted PostgreSQL role' }),
    ).toBeVisible()
    const credentialGate = page.locator('.workspace-gate')
    await credentialGate.locator('select').nth(0).selectOption(remoteResources.database)
    await credentialGate.locator('select').nth(1).selectOption(remoteResources.principal)
    const passwordInput = credentialGate.locator('input[type="password"]')
    await expect(passwordInput).toHaveAttribute('type', 'password')
    await passwordInput.fill(currentPassword)

    const catalogResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/connections/${connectionId}/workspace/catalog`),
    )
    await page.getByRole('button', { name: 'Open read-only workspace' }).click()
    expect((await catalogResponse).status()).toBe(200)
    await expect(page.getByRole('button', { name: 'Disconnect & forget password' })).toBeVisible()

    const relationButton = page.locator(
      `button[data-schema="public"][data-relation="${remoteResources.table}"]`,
    )
    await expect(relationButton).toBeVisible()
    const rowsResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/connections/${connectionId}/workspace/rows`),
    )
    await relationButton.click()
    expect((await rowsResponse).status()).toBe(200)
    await expect(page.locator('.workspace-results')).toContainText(
      'visible to the read-only E2E role',
    )

    const editor = page.getByLabel('Read-only SQL query')
    await editor.fill(`SELECT id, label FROM public."${remoteResources.table}" ORDER BY id`)
    const queryResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/connections/${connectionId}/workspace/query`),
    )
    await page.getByRole('button', { name: 'Run query' }).click()
    expect((await queryResponse).status()).toBe(200)
    await expect(page.locator('.workspace-results')).toContainText(
      'visible to the read-only E2E role',
    )

    await editor.fill(`WITH forbidden_write AS (
      UPDATE public."${remoteResources.table}"
      SET label = 'forbidden workspace change'
      WHERE id = 1
      RETURNING label
    ) SELECT * FROM forbidden_write`)
    const blockedResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/connections/${connectionId}/workspace/query`),
    )
    await page.getByRole('button', { name: 'Run query' }).click()
    expect((await blockedResponse).status()).toBe(409)
    await expect(page.locator('.workspace-inline-error')).toContainText(
      'read-only workspace blocked a write',
    )
    expect(await readSeededLabels()).toEqual(['visible to the read-only E2E role'])

    await page.reload()
    await expect(page.getByRole('heading', { name: connectionName })).toBeVisible()
    await page.getByRole('tab', { name: /Data & SQL/u }).click()
    await expect(
      page.getByRole('heading', { name: 'Connect a restricted PostgreSQL role' }),
    ).toBeVisible()
    await expect(page.getByLabel('Role password')).toHaveValue('')
  })

  test('keeps duplicate failures visible in the dialog', async ({ page }) => {
    await loginWithTwoFactor(page, owner)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: connectionName })).toBeVisible()
    await page.getByRole('button', { name: 'Database', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Create database' })
    await dialog.getByLabel('Database name').fill(remoteResources.database)
    await dialog.getByRole('button', { name: 'Create database' }).click()
    await expect(dialog.getByRole('alert')).toContainText(
      'A PostgreSQL resource with that name already exists.',
    )
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('creates a viewer, hides mutations, and rejects a direct manager mutation', async ({
    browser,
    page,
  }) => {
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

      await expect(viewerPage.locator('.identity')).toContainText(viewer.email)
      await expect(viewerPage.getByRole('heading', { name: connectionName })).toBeVisible()
      await expect(viewerPage.getByRole('button', { name: 'Add connection' })).toHaveCount(0)
      await expect(viewerPage.getByRole('button', { name: 'Database', exact: true })).toHaveCount(0)
      await expect(viewerPage.getByRole('button', { name: 'Create user' })).toHaveCount(0)
      await expect(
        viewerPage.getByRole('button', {
          name: `Connection details for ${remoteResources.database}`,
          exact: true,
        }),
      ).toHaveCount(0)
      await expect(viewerPage.getByRole('tab', { name: /Data & SQL/u })).toHaveCount(0)

      const viewerMetricsResponse = viewerPage.waitForResponse((response) =>
        response.url().endsWith(`/connections/${connectionId}/observability`),
      )
      await viewerPage.getByRole('tab', { name: /Observability/u }).click()
      expect((await viewerMetricsResponse).status()).toBe(200)
      await expect(viewerPage.getByText('Host CPU and RAM', { exact: true })).toBeVisible()

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
          principal: remoteResources.principal,
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
        { id: connectionId, name: 'dbcontrol_e2e_forbidden' },
      )
      expect(mutationStatus).toBe(403)
    } finally {
      await viewerContext.close()
    }
  })

  test('manages access, login, password rotation, and safe role deletion', async ({ page }) => {
    await loginWithTwoFactor(page, owner)
    await page.goto('/')
    await page.getByRole('tab', { name: /Users & roles/u }).click()

    await page
      .getByRole('button', {
        name: `View access for ${readTestPostgresSettings().user}`,
      })
      .click()
    const protectedDialog = page.getByRole('dialog', {
      name: `Access for ${readTestPostgresSettings().user}`,
    })
    await expect(protectedDialog.getByText('Current database access')).toBeVisible()
    await expect(protectedDialog.getByRole('button', { name: 'Apply preset' })).toHaveCount(0)
    await protectedDialog.getByRole('button', { name: 'Close dialog' }).click()
    await page.getByRole('button', { name: `Manage ${remoteResources.principal}` }).click()
    let dialog = page.getByRole('dialog', { name: `Manage ${remoteResources.principal}` })
    let accessRow = dialog
      .getByRole('table', { name: 'Current access for each database' })
      .getByRole('row', { name: new RegExp(remoteResources.database, 'u') })
    await expect(accessRow).toContainText('Matches Read only')
    await dialog
      .getByRole('combobox', { name: 'Database', exact: true })
      .selectOption(remoteResources.database)
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

    await page.getByRole('button', { name: `Manage ${remoteResources.principal}` }).click()
    dialog = page.getByRole('dialog', { name: `Manage ${remoteResources.principal}` })
    await dialog.getByRole('button', { name: 'Disable login' }).click()
    await expect(dialog.getByRole('button', { name: 'Enable login' })).toBeVisible()
    expect(await verifyLoginRejected(currentPassword)).toBe(true)
    await dialog.getByRole('button', { name: 'Enable login' }).click()
    await expect(dialog.getByRole('button', { name: 'Disable login' })).toBeVisible()
    expect(await verifySelectAccess(currentPassword)).toBe(true)

    await dialog.getByLabel('Database').selectOption(remoteResources.database)
    await dialog.getByRole('button', { name: 'Revoke explicit access' }).click()
    await expect(dialog).toContainText('PUBLIC still grants CONNECT')
    accessRow = dialog
      .getByRole('table', { name: 'Current access for each database' })
      .getByRole('row', { name: new RegExp(remoteResources.database, 'u') })
    await expect(accessRow).toContainText('No direct grant')
    await expect(accessRow).toContainText('Custom')
    await expect(accessRow).toContainText('PUBLIC')
    expect(await verifySelectAccess(currentPassword)).toBe(false)

    await dialog
      .getByLabel(`Type ${remoteResources.principal} to confirm`)
      .fill(remoteResources.principal)
    await dialog.getByRole('button', { name: 'Drop role' }).click()
    await expect(dialog).toBeHidden()
    await expect(
      page.getByRole('button', { name: `Manage ${remoteResources.principal}` }),
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
