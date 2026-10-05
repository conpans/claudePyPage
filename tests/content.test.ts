// Every piece of learning content, verified by running real Python through the real checker.
//
//   npx vitest run tests/content.test.ts                 verify the whole collection
//   ITEMS=running-totals,sum-fill npx vitest run tests/content.test.ts
//                                                        verify only these items (useful while
//                                                        writing them: links to items that do
//                                                        not exist yet are not reported)
//
// What is checked for a coding item:
//   - the reference solution passes every test, the examples, and breaks no stated restriction
//   - the starter code, left as it is, does not pass
//   - a program that just stores the first example's answer does not pass
//   - every prepared mistake fails in the way it says it does, and is recognised as itself
//   - every given value satisfies the item's `where` condition
// For a prediction item: the author's answers match a real run, and the prepared wrong
// answers really are wrong. For a skill: every prepared step-through example runs cleanly.

import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { readContent } from '../build/content-plugin.ts'
import { checkJobFor, predictJobFor, traceJobFor } from '../src/content/jobs.ts'
import { givenSource, toPythonLiteral } from '../src/content/python-literal.ts'
import { isCodeItem, type CodeItem, type JsonValue, type PredictItem } from '../src/content/schema.ts'
import { runJob } from '../src/python/engine.ts'
import type { CheckResult, RunResponse, TestResponse } from '../src/python/protocol.ts'
import { startPython, type TestPython } from './helpers/python.ts'

const { content, errors, referenceErrors } = readContent(resolve(import.meta.dirname, '../content'))
const only = process.env.ITEMS ? new Set(process.env.ITEMS.split(',').map((id) => id.trim())) : null
const selected = (id: string) => only === null || only.has(id)

let python: TestPython

beforeAll(async () => {
  python = await startPython()
})

function check(item: CodeItem, code: string): CheckResult {
  return runJob(python.engine, checkJobFor(item, code))
}

/** One line per test, for readable failure messages. */
function summary(result: CheckResult): string[] {
  return result.tests.map((test) => {
    if (!test.ran) return `${test.name}: not run`
    const details = test.checks
      .filter((line) => !line.ok)
      .map((line) => `${line.target}: expected ${line.expected ?? '?'}, got ${line.missing ? 'nothing' : (line.actual ?? '?')}`)
    const error = test.error ? ` ${test.error.type}: ${test.error.message} (line ${test.error.line ?? '?'})` : ''
    return `${test.name}: ${test.status}${error}${details.length ? ` [${details.join('; ')}]` : ''}`
  })
}

function givenSets(item: CodeItem): Record<string, JsonValue>[] {
  return [item.exampleGiven, ...item.examples.map((example) => example.given), ...item.tests.map((test) => test.given)]
}

describe('content files', () => {
  it('have no structural problems', () => {
    if (only === null) {
      expect(errors).toEqual([])
    } else {
      const files = [...only].map((id) => `${id}.yaml`)
      expect(errors.filter((message) => files.some((file) => message.includes(file)))).toEqual([])
    }
  })

  it.runIf(only === null)('link only to things that exist', () => {
    expect(referenceErrors).toEqual([])
  })
})

const codeItems = content.items.filter(isCodeItem).filter((item) => selected(item.id))
const predictItems = content.items.filter((item): item is PredictItem => item.format === 'predict').filter((item) => selected(item.id))

describe.each(codeItems.map((item) => [item.id, item] as const))('%s', (_id, item) => {
  it('reference solution passes every test and breaks no restriction', () => {
    const result = check(item, item.solution.code)
    expect(summary(result)).toEqual(item.tests.map((test) => `${test.name}: pass`))
    expect(result.inspection.forbidden).toEqual([])
    expect(result.inspection.hardCoded).toEqual([])
    expect(result.passed).toBe(true)
  })

  it('reference solution reproduces every example', () => {
    for (const example of item.examples) {
      const response = python.engine.call<TestResponse>({
        kind: 'test',
        code: item.solution.code,
        given: givenSource(example.given),
        expect: {
          variables: Object.fromEntries(Object.entries(example.result).map(([name, value]) => [name, toPythonLiteral(value)])),
          stdout: example.output,
        },
        unchanged: item.unchanged,
        fresh: item.fresh,
        inPlace: item.inPlace,
        mistakes: [],
      })
      expect(response.status, `example ${givenSource(example.given).trim()}`).toBe('pass')
    }
  })

  it('reference solution runs with the values shown in the editor', () => {
    const response = python.engine.call<RunResponse>({
      kind: 'run',
      code: item.solution.code,
      given: givenSource(item.exampleGiven),
    })
    expect(response.status).toBe('ok')
  })

  it('starter code does not already pass', () => {
    const stop = python.interruptAfter(1500)
    const result = check(item, item.starter)
    stop()
    expect(result.passed).toBe(false)
  })

  it('a program that only stores the first example answer does not pass', () => {
    const example = item.examples[0]
    if (!example) throw new Error('an item needs at least one example')
    const lines = Object.entries(example.result).map(([name, value]) => `${name} = ${toPythonLiteral(value)}`)
    if (example.output !== null) lines.push(`print(${JSON.stringify(example.output)})`)
    const result = check(item, lines.join('\n'))
    expect(result.passed, 'the tests need an input whose answer differs from the first example').toBe(false)
  })

  if (item.where !== null) {
    const where = item.where
    it(`all given values satisfy: ${where}`, () => {
      for (const given of givenSets(item)) {
        const response = python.engine.call<RunResponse>({
          kind: 'run',
          code: `holds = bool(${where})`,
          given: givenSource(given),
        })
        const holds = response.variables.find((variable) => variable.name === 'holds')?.value.text
        expect(holds, givenSource(given).trim()).toBe('True')
      }
    })
  }

  for (const mistake of item.mistakes) {
    it(`mistake "${mistake.id}" fails as described and is recognised`, () => {
      const stop = python.interruptAfter(1500)
      const result = check(item, mistake.code)
      stop()
      expect(result.passed).toBe(false)
      const ran = result.tests.flatMap((test) => (test.ran ? [test] : []))
      if (mistake.shows === 'wrong-result') {
        const recognised = ran.filter((test) => test.status === 'fail' && test.mistakeId === mistake.id)
        expect(recognised.length, summary(result).join(' | ')).toBeGreaterThan(0)
        // The first failing test is the one a learner sees in detail, so it must give this feedback.
        const firstFailure = ran.find((test) => test.status !== 'pass')
        expect(firstFailure?.mistakeId, summary(result).join(' | ')).toBe(mistake.id)
      } else if (mistake.shows === 'error') {
        const firstFailure = ran.find((test) => test.status !== 'pass')
        expect(firstFailure?.status, summary(result).join(' | ')).toBe('error')
        expect(firstFailure?.error?.type).toBe(mistake.errorType)
        expect(firstFailure?.mistakeId).toBe(mistake.id)
      } else {
        const firstFailure = ran.find((test) => test.status !== 'pass')
        expect(['stopped', 'output-limit'], summary(result).join(' | ')).toContain(firstFailure?.status)
        expect(firstFailure?.mistakeId).toBe(mistake.id)
      }
    })
  }
})

describe.each(predictItems.map((item) => [item.id, item] as const))('%s', (_id, item) => {
  it("author's answers match a real run of the program", () => {
    const result = runJob(python.engine, predictJobFor(item, item.questions.map((question) => question.answer)))
    expect(result.status).toBe('ok')
    expect(result.results.map((entry) => entry.broken)).toEqual(item.questions.map(() => null))
    item.questions.forEach((question, index) => {
      expect(result.results[index]?.correct, `"${question.ask}" really gives: ${result.truths[index] ?? '?'}`).toBe(true)
      // The stored answer should be written exactly as Python shows it, so no tolerance was needed.
      expect(result.results[index]?.note, `"${question.ask}" really gives: ${result.truths[index] ?? '?'}`).toBeNull()
    })
  })

  it('prepared wrong answers are wrong, and each gets its own feedback', () => {
    item.questions.forEach((question, index) => {
      question.wrong.forEach((wrong, wrongIndex) => {
        const answers = item.questions.map((other, otherIndex) => (otherIndex === index ? wrong.answer : other.answer))
        const result = runJob(python.engine, predictJobFor(item, answers))
        expect(result.results[index]?.correct, `"${wrong.answer}" for "${question.ask}"`).toBe(false)
        expect(result.results[index]?.wrongIndex, `"${wrong.answer}" for "${question.ask}"`).toBe(wrongIndex)
      })
    })
  })
})

const skills = content.skills.filter((skill) => only === null || only.has(skill.id))

describe.each(skills.map((skill) => [skill.id, skill] as const))('skill %s', (_id, skill) => {
  const demos = skill.sections.flatMap((section) => (section.demo ? [section.demo] : []))
  it.runIf(demos.length > 0)('prepared step-through examples run cleanly', () => {
    for (const demo of demos) {
      const result = runJob(python.engine, traceJobFor(demo.code, givenSource(demo.given)))
      expect(result.status, demo.title).toBe('ok')
      expect(result.steps.length, demo.title).toBeGreaterThan(1)
      expect(result.states).toHaveLength(result.steps.length + 1)
    }
  })
})
