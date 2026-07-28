export const sessionClient = {
  openControlCenter(): void {
    window.location.assign('/admin')
  },

  openSecuritySettings(): void {
    window.location.assign('/security')
  },

  async signOut(): Promise<void> {
    const response = await fetch('/api/users/logout', {
      credentials: 'same-origin',
      method: 'POST',
    })
    if (!response.ok) throw new Error('Sign out failed')
    window.location.assign('/login')
  },
}
