// Turns content values (parsed from YAML) into Python source text.

import type { JsonValue } from './schema.ts'

export function toPythonLiteral(value: JsonValue): string {
  if (value === null) return 'None'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Cannot write ${String(value)} as a Python number.`)
    return String(value)
  }
  // JSON string syntax is also valid Python string syntax, with the same meaning.
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(toPythonLiteral).join(', ')}]`
  const entries = Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${toPythonLiteral(item)}`)
  return `{${entries.join(', ')}}`
}

/** `{numbers: [3, 1, 4], limit: 2}` becomes two lines: `numbers = [3, 1, 4]` and `limit = 2`. */
export function givenSource(given: Record<string, JsonValue>): string {
  return Object.entries(given)
    .map(([name, value]) => `${name} = ${toPythonLiteral(value)}\n`)
    .join('')
}
