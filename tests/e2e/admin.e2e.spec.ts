import { test, expect, Page } from '@playwright/test'
import { login } from '../helpers/login'
import { seedTestUser, cleanupTestUser, testUser } from '../helpers/seedUser'

test.describe('Admin Panel', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    await seedTestUser()

    const context = await browser.newContext()
    page = await context.newPage()

    await login({ page, user: testUser })
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  test('can navigate to dashboard', async () => {
    await page.goto('http://localhost:3000/admin')
    await expect(page).toHaveURL('http://localhost:3000/admin')
    const dashboardArtifact = page.getByTestId('dbmason-admin-dashboard')
    await expect(dashboardArtifact).toBeVisible()
    await expect(page.getByRole('heading', { name: 'DBMason control center' })).toBeVisible()
    const navigation = page.getByRole('region', { name: 'DBMason navigation' })
    await expect(navigation.getByRole('link', { name: 'Team accounts' })).toBeVisible()
    await expect(navigation.getByRole('link', { name: 'Audit trail' })).toBeVisible()
  })

  test('opens the control center from the main workspace', async () => {
    await page.goto('http://localhost:3000')
    await page.getByRole('button', { name: 'Open control center' }).click()
    await expect(page).toHaveURL('http://localhost:3000/admin')
  })

  test('can navigate to list view', async () => {
    await page.goto('http://localhost:3000/admin/collections/users')
    await expect(page).toHaveURL('http://localhost:3000/admin/collections/users')
    const listViewArtifact = page.getByRole('heading', { name: 'Team accounts' })
    await expect(listViewArtifact).toBeVisible()
  })

  test('can navigate to edit view', async () => {
    await page.goto('http://localhost:3000/admin/collections/users/create')
    await expect(page).toHaveURL(/\/admin\/collections\/users\/[a-zA-Z0-9-_]+/)
    const editViewArtifact = page.locator('input[name="email"]')
    await expect(editViewArtifact).toBeVisible()
  })

  test('keeps the workspace inside narrow viewports', async () => {
    for (const width of [320, 375, 768]) {
      await page.setViewportSize({ height: 800, width })
      await page.goto('http://localhost:3000')
      const pageWidth = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }))
      expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.client)
    }
    await page.setViewportSize({ height: 720, width: 1280 })
  })

  test('shows a logout failure and then signs out successfully', async () => {
    await page.route('**/api/users/logout', async (route) => {
      await route.fulfill({ body: 'Unavailable', status: 503 })
    })
    await page.goto('http://localhost:3000')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.locator('.workspace-sign-out__error[role="alert"]')).toContainText(
      'Sign out failed',
    )

    await page.unroute('**/api/users/logout')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('http://localhost:3000/login')
  })
})
