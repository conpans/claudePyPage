// Builds the jobs the Python worker runs from content items. The page and the automated
// tests both use these, so what the test suite verifies is what a learner's Check runs.

import type { CheckJob, MistakeProbe, PredictJob, RunJob, TraceJob } from '../python/protocol.ts'
import { givenSource, toPythonLiteral } from './python-literal.ts'
import type { CodeItem, Mistake, PredictItem } from './schema.ts'

/** A step-through records at most this many executed lines. */
export const MAX_TRACE_STEPS = 300

function probeFor(mistake: Mistake): MistakeProbe {
  if (mistake.shows === 'error') {
    return {
      id: mistake.id,
      code: mistake.code,
      match: 'error',
      errorType: mistake.errorType ?? '',
      ...(mistake.errorContains ? { errorContains: mistake.errorContains } : {}),
    }
  }
  return { id: mistake.id, code: mistake.code, match: mistake.shows === 'never-stops' ? 'stopped' : 'values' }
}

export function checkJobFor(item: CodeItem, code: string): CheckJob {
  return {
    type: 'check',
    code,
    givenNames: item.given.map((spec) => spec.name),
    forbid: item.forbid,
    unchanged: item.unchanged,
    fresh: item.fresh,
    inPlace: item.inPlace,
    tests: item.tests.map((test) => ({
      name: test.name,
      purpose: test.purpose,
      given: givenSource(test.given),
      expect: {
        variables: Object.fromEntries(Object.entries(test.expect).map(([name, value]) => [name, toPythonLiteral(value)])),
        stdout: test.output,
      },
    })),
    mistakes: item.mistakes.map(probeFor),
  }
}

export function runJobFor(code: string, given: string): RunJob {
  return { type: 'run', code, given }
}

export function traceJobFor(code: string, given: string, maxSteps = MAX_TRACE_STEPS): TraceJob {
  return { type: 'trace', code, given, maxSteps }
}

export function predictJobFor(item: PredictItem, answers: string[]): PredictJob {
  return {
    type: 'predict',
    program: item.program,
    questions: item.questions.map((question) => ({
      about: question.about,
      ...(question.expression ? { expression: question.expression } : {}),
      wrong: question.wrong.map((entry) => entry.answer),
    })),
    answers,
  }
}
