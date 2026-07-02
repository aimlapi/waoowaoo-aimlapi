export function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export function hasName(names: ReadonlySet<string>, value: string): boolean {
  return names.has(normalizeName(value))
}
