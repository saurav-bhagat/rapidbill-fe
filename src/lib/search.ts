/** All whitespace-separated tokens must appear (case-insensitive) in one of the fields. */
export function matchesQuery(query: string, fields: string[]): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const hay = fields.join(' \u0000 ').toLowerCase()
  return tokens.every((t) => hay.includes(t))
}
