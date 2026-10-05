// `npm run verify:native [-- item-id ...]`
//
// Cross-checks the learning content against this computer's own Python (see
// scripts/native_check.py), and then compares the prepared step-through examples between the
// two interpreters: the trace the app shows (Pyodide) must equal native CPython's, step for
// step and value for value.
//
// Needs Node 22.18 or newer (it imports the project's TypeScript directly) and python3.

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readContent } from '../build/content-plugin.ts'
import { MAX_TRACE_STEPS } from '../src/content/jobs.ts'
import { givenSource, toPythonLiteral } from '../src/content/python-literal.ts'
import { createEngine } from '../src/python/engine.ts'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const only = process.argv.slice(2)
const selected = (id) => only.length === 0 || only.includes(id)

const { content, errors, referenceErrors } = readContent(join(projectRoot, 'content'))
const structural = only.length === 0 ? [...errors, ...referenceErrors] : errors.filter((message) => only.some((id) => message.includes(`${id}.yaml`)))
if (structural.length > 0) {
  console.error(`The content files have ${structural.length} problem(s):`)
  for (const message of structural) console.error(`  - ${message}`)
  process.exit(1)
}

const sources = (values) => Object.fromEntries(Object.entries(values).map(([name, value]) => [name, toPythonLiteral(value)]))

const codeItems = content.items
  .filter((item) => item.format !== 'predict' && selected(item.id))
  .map((item) => ({
    id: item.id,
    given: item.given,
    where: item.where,
    create: item.create.map((spec) => spec.name),
    prints: item.prints !== null,
    unchanged: item.unchanged,
    fresh: item.fresh,
    inPlace: item.inPlace,
    solution: item.solution.code,
    tests: item.tests.map((test) => ({
      name: test.name,
      given: test.given,
      givenSource: givenSource(test.given),
      expect: test.expect,
      expectSource: sources(test.expect),
      output: test.output,
    })),
    examples: item.examples.map((example) => ({ given: example.given, result: example.result, output: example.output })),
  }))

const predictItems = content.items
  .filter((item) => item.format === 'predict' && selected(item.id))
  .map((item) => ({
    id: item.id,
    program: item.program,
    questions: item.questions.map((question) => ({
      about: question.about,
      ...(question.expression ? { expression: question.expression } : {}),
      wrong: [],
    })),
    answers: item.questions.map((question) => question.answer),
  }))

const demos = content.skills
  .filter((skill) => selected(skill.id))
  .flatMap((skill) =>
    skill.sections.flatMap((section) =>
      section.demo
        ? [{ key: `${skill.id} / ${section.demo.title}`, code: section.demo.code, given: givenSource(section.demo.given), maxSteps: MAX_TRACE_STEPS }]
        : [],
    ),
  )

const workFolder = join(projectRoot, 'node_modules', '.cache', 'stepwise')
mkdirSync(workFolder, { recursive: true })
const bundlePath = join(workFolder, 'native-bundle.json')
writeFileSync(bundlePath, JSON.stringify({ codeItems, predictItems, demos, requireOracles: true }))

const python = spawnSync('python3', [join(projectRoot, 'scripts', 'native_check.py'), bundlePath], {
  cwd: projectRoot,
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
})
if (python.error) {
  console.error(`python3 could not be started: ${python.error.message}`)
  console.error('This check needs Python 3 on this computer (in WSL: sudo apt install python3).')
  process.exit(1)
}
if (python.status !== 0) {
  console.error('The native check stopped with an error:')
  console.error(python.stderr)
  process.exit(1)
}

const report = JSON.parse(python.stdout)
const failures = [...report.failures]

// Compare each prepared step-through between Pyodide and native CPython.
const { loadPyodide } = await import('pyodide')
const pyodide = await loadPyodide()
const engine = createEngine(pyodide, readFileSync(join(projectRoot, 'src', 'python', 'harness.py'), 'utf8'))
for (const demo of demos) {
  const browserTrace = engine.call({ kind: 'trace', code: demo.code, given: demo.given, maxSteps: demo.maxSteps })
  if (JSON.stringify(browserTrace) !== JSON.stringify(report.traces[demo.key])) {
    failures.push(`${demo.key}: the step-through differs between Pyodide and native Python`)
  }
}

console.log(`Native Python ${report.python}, Pyodide Python ${engine.pythonVersion}`)
console.log(`Checked ${codeItems.length} coding items, ${predictItems.length} prediction items, ${demos.length} step-through examples.`)
for (const [what, count] of Object.entries(report.counts)) console.log(`  ${what}: ${count}`)
console.log(`  step-through examples compared across interpreters: ${demos.length}`)

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):`)
  for (const message of failures) console.error(`  - ${message}`)
  process.exit(1)
}
console.log('\nAll native cross-checks passed.')
