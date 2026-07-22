const maxIdentifierBytes = 63

export function quoteIdentifier(value: string): string {
  const bytes = Buffer.byteLength(value, 'utf8')
  if (bytes === 0 || bytes > maxIdentifierBytes || value.includes('\0')) {
    throw new RangeError(`PostgreSQL identifiers must be 1-${maxIdentifierBytes} UTF-8 bytes`)
  }

  return `"${value.replaceAll('"', '""')}"`
}
