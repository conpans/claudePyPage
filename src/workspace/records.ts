// Turns a finished check into what is shown to the learner and what is saved as progress.
// Pure functions, so the rules that pick feedback can be tested without a browser.

import type { CodeItem, Mistake } from '../content/schema.ts'
import type { CheckResult, TestOutcome } from '../python/protocol.ts'
import type { CheckRecord, TestProblem } from '../state/progress.ts'

type RanTest = Extract<TestOutcome, { ran: true }>

export function isUnchangedStarter(item: CodeItem, code: string): boolean {
  return code.trim() === item.starter.trim()
}

/**
 * The prepared feedback for a test that did not pass, or null when no prepared mistake fits.
 * The rules, in order:
 *   1. Untouched starter code of a "write" or "missing line" item gets no mistake feedback:
 *      nothing has been attempted yet.
 *   2. The checker recognised a prepared mistake (same wrong result, or same kind of error).
 *   3. The program had to be stopped, and the item has a prepared "never stops" mistake.
 */
export function feedbackFor(item: CodeItem, test: RanTest, unchangedStarter: boolean): Mistake | null {
  if (test.status === 'pass') return null
  if (unchangedStarter && item.format !== 'fix') return null
  const recognised = item.mistakes.find((mistake) => mistake.id === test.mistakeId)
  if (recognised) return recognised
  if (test.status === 'stopped' || test.status === 'output-limit') {
    return item.mistakes.find((mistake) => mistake.shows === 'never-stops') ?? null
  }
  return null
}

export function firstProblem(result: CheckResult): RanTest | null {
  for (const test of result.tests) {
    if (test.ran && test.status !== 'pass') return test
  }
  return null
}

export function restrictionMessages(result: CheckResult): string[] {
  return result.inspection.forbidden.map(
    (hit) => `Line ${hit.line} uses \`${hit.what}\`, which this exercise asks you not to use.`,
  )
}

const MAX_SAVED_OUTPUT = 2000

export function toCheckRecord(item: CodeItem, result: CheckResult, code: string, at: string): CheckRecord {
  const problemTest = firstProblem(result)
  let problem: TestProblem | null = null
  if (problemTest) {
    const feedback = feedbackFor(item, problemTest, isUnchangedStarter(item, code))
    problem = {
      name: problemTest.name,
      given: problemTest.given,
      status: problemTest.status,
      lines: problemTest.checks
        .filter((line) => !line.ok)
        .map((line) => ({ target: line.target, expected: line.expected, actual: line.actual, missing: line.missing, note: line.note })),
      error: problemTest.error
        ? { type: problemTest.error.type, message: problemTest.error.message, line: problemTest.error.line }
        : null,
      output: problemTest.stdout.slice(0, MAX_SAVED_OUTPUT),
      feedback: feedback?.feedback ?? null,
      stopReason: problemTest.stopReason ?? null,
    }
  }
  return {
    at,
    passed: result.passed,
    passedCount: result.tests.filter((test) => test.ran && test.status === 'pass').length,
    total: result.tests.length,
    problem,
    restrictions: restrictionMessages(result),
  }
}
