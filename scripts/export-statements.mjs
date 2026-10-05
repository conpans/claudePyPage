// `node scripts/export-statements.mjs`
//
// Writes one file per coding item into .local/statements/, holding only what a learner sees
// before attempting it: the task, the given values and their limits, the rules, and the
// examples. Hints, tests, expected values and solutions are left out.
//
// These files are what an oracle author works from (see verify/oracles/README.md), so that
// the second solution is written from the task alone and not from the reference solution.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readContent } from '../build/content-plugin.ts'
import { toPythonLiteral } from '../src/content/python-literal.ts'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const target = join(projectRoot, '.local', 'statements')
const { content } = readContent(join(projectRoot, 'content'))

function describeDomain(spec) {
  const { type, domain } = spec
  const parts = []
  if (domain.minLen !== undefined) parts.push(`${domain.minLen} to ${domain.maxLen} items`)
  if (domain.oneOf !== undefined) {
    parts.push(`${type.startsWith('list') ? 'each item ' : ''}one of ${domain.oneOf.map((entry) => JSON.stringify(entry)).join(', ')}`)
  }
  else if (domain.min !== undefined) parts.push(`${type.startsWith('list') ? 'each item ' : ''}from ${domain.min} to ${domain.max}`)
  return parts.length > 0 ? ` Allowed: ${parts.join('; ')}.` : ''
}

function assignments(values) {
  return Object.entries(values)
    .map(([name, value]) => `${name} = ${toPythonLiteral(value)}`)
    .join(', ')
}

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })

let count = 0
for (const item of content.items) {
  if (item.format === 'predict') continue
  const lines = [
    `# ${item.title} (${item.id})`,
    '',
    `Goal: ${item.goal}`,
    '',
    item.statement,
    '',
    // A repair or missing-line task talks about "the program below": include it.
    ...(item.format === 'fix' || item.format === 'fill'
      ? ['## The program you are given', '```python', item.starter.trimEnd(), '```', '']
      : []),
    '## Given',
    ...item.given.map((spec) => `- \`${spec.name}\` (${spec.type}): ${spec.describe}.${describeDomain(spec)}`),
  ]
  if (item.given.length === 0) lines.push('- nothing')
  if (item.where) lines.push('', `Always true for the given values: \`${item.where}\``)
  lines.push('', '## Result')
  for (const spec of item.create) lines.push(`- variable \`${spec.name}\`: ${spec.describe}`)
  if (item.prints) lines.push(`- printed output: ${item.prints}`)
  lines.push('', '## Rules', ...item.rules.map((rule) => `- ${rule}`))
  lines.push('', '## Examples')
  for (const example of item.examples) {
    const results = [assignments(example.result)]
    if (example.output !== null) results.push(`prints:\n${example.output}`)
    lines.push(`- given ${assignments(example.given) || 'nothing'} → ${results.filter(Boolean).join('; ')}`)
  }
  lines.push(
    '',
    '## Oracle signature',
    '```python',
    `def oracle(${item.given.map((spec) => spec.name).join(', ')}):`,
    `    return {${[...item.create.map((spec) => `"${spec.name}": ...`), ...(item.prints ? ['"output": ...'] : [])].join(', ')}}`,
    '```',
    '',
  )
  writeFileSync(join(target, `${item.id}.md`), lines.join('\n'))
  count += 1
}
console.log(`Wrote ${count} task statements to .local/statements/`)
