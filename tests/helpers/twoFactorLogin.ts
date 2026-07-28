import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { generateTotpCode } from '../../src/auth/two-factor/totp'

type LoginUser = {
  email: string
  password: string
}

const authenticatorSecrets = new Map<string, string>()
const recoveryCodes = new Map<string, string[]>()

function pageURL(path: string, serverURL?: string): string {
  return serverURL ? `${serverURL}${path}` : path
}

async function readEnrollment(page: Page, email: string): Promise<string> {
  const manualKey = page.getByTestId('two-factor-manual-key')
  await expect(manualKey).toBeVisible()
  const secret = (await manualKey.textContent())?.replaceAll(/\s/gu, '') ?? ''
  if (!secret) throw new Error('The 2FA enrollment key was not displayed.')
  authenticatorSecrets.set(email, secret)
  return secret
}

async function saveRecoveryCodes(page: Page, email: string): Promise<void> {
  const list = page.getByTestId('two-factor-recovery-codes')
  await expect(list).toBeVisible()
  const codes = (await list.locator('code').allTextContents()).filter(Boolean)
  if (codes.length === 0) throw new Error('2FA recovery codes were not displayed.')
  recoveryCodes.set(email, codes)
  await page.getByRole('button', { name: /I saved them/u }).click()
}

export async function enableTwoFactorForTest(
  page: Page,
  user: LoginUser,
  serverURL?: string,
): Promise<void> {
  await page.goto(pageURL('/security', serverURL))
  await page.locator('#security-current-password').fill(user.password)
  await page.getByRole('button', { name: 'Set up authenticator' }).click()
  const secret = await readEnrollment(page, user.email)
  await page.locator('#security-enrollment-code').fill(generateTotpCode(secret))
  await page.getByRole('button', { name: 'Enable 2FA', exact: true }).click()
  await saveRecoveryCodes(page, user.email)
  await page.waitForURL((url) => url.pathname === '/login')
}

export async function disableTwoFactorForTest(
  page: Page,
  user: LoginUser,
  serverURL?: string,
): Promise<void> {
  const savedCodes = recoveryCodes.get(user.email)
  const recoveryCode = savedCodes?.shift()
  if (!recoveryCode) {
    throw new Error(`No unused recovery code is available for ${user.email}.`)
  }

  await page.goto(pageURL('/security', serverURL))
  await expect(page.getByText('2FA is on', { exact: true })).toBeVisible()
  await page.locator('#security-disable-password').fill(user.password)
  await page.locator('#security-disable-code').fill(recoveryCode)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Disable 2FA', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/login')
}

export async function loginWithTwoFactor(
  page: Page,
  user: LoginUser,
  serverURL?: string,
): Promise<void> {
  await page.goto(pageURL('/login', serverURL))
  await page.locator('#field-email').fill(user.email)
  await page.locator('#field-password').fill(user.password)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  const nextStep = await Promise.race([
    page.waitForURL((url) => url.pathname === '/').then(() => 'authenticated' as const),
    page
      .locator('#field-two-factor-code')
      .waitFor({ state: 'visible' })
      .then(() => 'factor' as const),
  ])
  if (nextStep === 'authenticated') return

  const savedCodes = recoveryCodes.get(user.email)
  const recoveryCode = savedCodes?.shift()
  const secret = authenticatorSecrets.get(user.email)
  if (!recoveryCode && !secret) {
    throw new Error(`No test authenticator or recovery code is available for ${user.email}.`)
  }
  await page.locator('#field-two-factor-code').fill(recoveryCode ?? generateTotpCode(secret ?? ''))
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/')
}
