export function hasUnescapedMysqlWildcard(pattern: string): boolean {
  let escaped = false
  for (const character of pattern) {
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (character === '%' || character === '_') return true
  }
  return false
}

export function mysqlDatabaseGrantPattern(
  database: string,
  partialRevokes: boolean,
): string {
  if (partialRevokes) return database
  return database.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}

export function mysqlGrantPatternMatches(pattern: string, database: string): boolean {
  const databaseCharacters = [...database]
  let previous = Array<boolean>(databaseCharacters.length + 1).fill(false)
  previous[0] = true
  let escaped = false
  for (const character of pattern) {
    const current = Array<boolean>(databaseCharacters.length + 1).fill(false)
    if (escaped) {
      for (let index = 1; index <= databaseCharacters.length; index += 1) {
        current[index] =
          previous[index - 1] === true &&
          databaseCharacters[index - 1] === character
      }
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === '%') {
      current[0] = previous[0] === true
      for (let index = 1; index <= databaseCharacters.length; index += 1) {
        current[index] = previous[index] === true || current[index - 1] === true
      }
    } else if (character === '_') {
      for (let index = 1; index <= databaseCharacters.length; index += 1) {
        current[index] = previous[index - 1] === true
      }
    } else {
      for (let index = 1; index <= databaseCharacters.length; index += 1) {
        current[index] =
          previous[index - 1] === true &&
          databaseCharacters[index - 1] === character
      }
    }
    if (character !== '\\' || escaped === false) previous = current
  }
  if (escaped) {
    const current = Array<boolean>(databaseCharacters.length + 1).fill(false)
    for (let index = 1; index <= databaseCharacters.length; index += 1) {
      current[index] =
        previous[index - 1] === true &&
        databaseCharacters[index - 1] === '\\'
    }
    previous = current
  }
  return previous[databaseCharacters.length] ?? false
}
