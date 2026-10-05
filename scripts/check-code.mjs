// node scripts/check-code.mjs <item-id> <path-to-a-python-file>
//
// Runs a program through the app's real checker for one coding item and prints what a
// learner would see: each test's result, the note for the first failure, and the prepared
// feedback if a known mistake was recognised. Handy for trying alternative solutions and
// wrong attempts while writing or reviewing content.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { loadPyodide } from 'pyodide'
import { readContent } from '../build/content-plugin.ts'
import { checkJobFor } from '../src/content/jobs.ts'
import { createEngine, runJob } from '../src/python/engine.ts'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const [itemId, codePath] = process.argv.slice(2)
if (!itemId || !codePath) {
  console.error('Usage: node scripts/check-code.mjs <item-id> <path-to-a-python-file>')
  process.exit(2)
}

const { content } = readContent(join(projectRoot, 'content'))
const item = content.items.find((entry) => entry.id === itemId)
if (!item) {
  console.error(`There is no item with the id "${itemId}".`)
  process.exit(2)
}
if (item.format === 'predict') {
  console.error(`"${itemId}" is a prediction item, so there is no code to check.`)
  process.exit(2)
}

const code = readFileSync(codePath, 'utf8')
const pyodide = await loadPyodide()
const engine = createEngine(pyodide, readFileSync(join(projectRoot, 'src', 'python', 'harness.py'), 'utf8'))

// Stop a program that never ends, the way the app's time limit does.
const shared = new SharedArrayBuffer(4)
pyodide.setInterruptBuffer(new Int32Array(shared))
const timer = new Worker(
  `const { workerData } = require('node:worker_threads')
   setTimeout(() => { new Int32Array(workerData)[0] = 2 }, 3000)`,
  { eval: true, workerData: shared },
)
const result = runJob(engine, checkJobFor(item, code))
await timer.terminate()

for (const hit of result.inspection.forbidden) console.log(`RESTRICTION: uses ${hit.what} on line ${hit.line}`)
for (const hit of result.inspection.hardCoded) console.log(`NOTE: line ${hit.line} gives ${hit.name} a fixed value`)

let shownDetail = false
for (const test of result.tests) {
  if (!test.ran) {
    console.log(`  not run  ${test.name}`)
    continue
  }
  console.log(`  ${test.status.padEnd(8)} ${test.name}`)
  if (test.status === 'pass' || shownDetail) continue
  shownDetail = true
  console.log(`           given: ${test.given.trim().replaceAll('\n', '; ')}`)
  if (test.error) console.log(`           ${test.error.type}: ${test.error.message} (line ${test.error.line ?? '?'})`)
  for (const line of test.checks.filter((entry) => !entry.ok)) {
    console.log(`           ${line.target}: expected ${line.expected ?? '?'}, got ${line.missing ? 'no such variable' : (line.actual ?? '?')}`)
    if (line.note) console.log(`           note: ${line.note}`)
  }
  const mistake = item.mistakes.find((entry) => entry.id === test.mistakeId)
  console.log(mistake ? `           recognised mistake "${mistake.id}": ${mistake.feedback.replaceAll('\n', ' ')}` : '           no prepared mistake matched')
}
console.log(result.passed ? '\nPASSED' : '\nNOT PASSED')
process.exit(result.passed ? 0 : 1)
