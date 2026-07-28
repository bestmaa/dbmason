import type { Page } from '@playwright/test'

import { loginWithTwoFactor } from './twoFactorLogin'

export interface LoginOptions {
  page: Page
  serverURL?: string
  user: {
    email: string
    password: string
  }
}

/**
 * Logs the user into the admin panel via the login page.
 */
export async function login({
  page,
  serverURL = 'http://localhost:3000',
  user,
}: LoginOptions): Promise<void> {
  await loginWithTwoFactor(page, user, serverURL)
}
