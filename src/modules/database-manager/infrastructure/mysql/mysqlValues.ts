export function mysqlBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

export function mysqlNonnegativeInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`MySQL returned an invalid ${label}`)
  }
  return parsed
}
