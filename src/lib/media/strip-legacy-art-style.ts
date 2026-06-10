export function stripLegacyArtStyle(input: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...input }
  delete normalized.artStyle
  return normalized
}
