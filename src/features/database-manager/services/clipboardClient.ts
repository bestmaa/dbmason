export const clipboardClient = {
  async copy(value: string): Promise<void> {
    await navigator.clipboard.writeText(value)
  },
}
