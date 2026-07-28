import { expect, test } from '@playwright/test'

test.describe('Frontend access gate', () => {
  test('shows the protected DBMason entry point', async ({ page }) => {
    await page.goto('http://localhost:3000')
    await expect(page).toHaveTitle(/DBMason/)
    await expect(page.locator('h1')).toContainText(/Welcome back|Secure your control plane/)
    const action = page.getByRole('link', { name: /Sign in|Create owner account/ })
    await expect(action).toBeVisible()
    await expect(action).toHaveAttribute('href', /^\/(?:login|setup)$/u)
  })
})
