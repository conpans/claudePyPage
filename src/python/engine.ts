// Runs jobs against a loaded Pyodide interpreter. This file knows nothing about workers or
// the browser, so the page's worker and the automated tests (Pyodide under Node) share it:
// the checker that grades a learner's attempt is the same code the test suite exercises.

import type {
  CheckJob,
  CheckResult,
  InspectResponse,
  Job,
  JobProgress,
  JobResults,
  PredictResponse,
  RunResponse,
  TestOutcome,
  TestResponse,
  TraceResponse,
} from './protocol.ts'

/** The few Pyodide features the engine needs. */
export interface PyodideLike {
  runPython(code: string, options?: { globals?: unknown; filename?: string }): unknown
  toPy(value: unknown): unknown
}

interface HarnessNamespace {
  get(name: string): unknown
}

export interface Engine {
  /** Send one request to harness.py and return its parsed answer. */
  call<T>(request: Record<string, unknown>): T
  pythonVersion: string
}

export function createEngine(pyodide: PyodideLike, harnessSource: string): Engine {
  // The harness gets its own namespace, so learner code can never see or change it by name.
  const namespace = pyodide.toPy({}) as HarnessNamespace
  pyodide.runPython(harnessSource, { globals: namespace, filename: 'harness.py' })
  const handle = namespace.get('handle') as (requestJson: string) => string
  const pythonVersion = String(pyodide.runPython('import sys\nsys.version.split()[0]'))
  return {
    call<T>(request: Record<string, unknown>): T {
      return JSON.parse(handle(JSON.stringify(request))) as T
    },
    pythonVersion,
  }
}

const EMPTY_RUN: RunResponse = {
  status: 'stopped',
  error: null,
  stopLine: null,
  stdout: '',
  outputTruncated: false,
  variables: [],
}

/** The harness answers with a bare `{status: 'stopped'}` if it was interrupted between programs. */
function complete<T extends object>(response: Partial<T>, defaults: T): T {
  return { ...defaults, ...response }
}

function runCheck(engine: Engine, job: CheckJob, progress: (event: JobProgress) => void): CheckResult {
  const inspection = engine.call<InspectResponse>({
    kind: 'inspect',
    code: job.code,
    forbid: job.forbid,
    givenNames: job.givenNames,
  })

  const tests: TestOutcome[] = []
  let halted = false
  job.tests.forEach((test, index) => {
    const label = { name: test.name, purpose: test.purpose, given: test.given }
    if (halted) {
      tests.push({ ran: false, ...label })
      return
    }
    progress({ kind: 'test-start', index })
    const response = complete<TestResponse>(
      engine.call<Partial<TestResponse>>({
        kind: 'test',
        code: job.code,
        given: test.given,
        expect: test.expect,
        unchanged: job.unchanged,
        fresh: job.fresh,
        inPlace: job.inPlace,
        mistakes: job.mistakes,
      }),
      { ...EMPTY_RUN, status: 'stopped', checks: [], mistakeId: null },
    )
    const outcome: TestOutcome = { ran: true, ...label, ...response }
    tests.push(outcome)
    progress({ kind: 'test-done', index, outcome })
    // A stopped program would be stopped again on every remaining test, and a syntax error is
    // the same for all of them, so running the rest would only repeat the same message.
    if (response.status === 'stopped' || response.status === 'syntax-error') halted = true
  })

  const allPassed = tests.every((test) => test.ran && test.status === 'pass')
  return { inspection, tests, passed: allPassed && inspection.forbidden.length === 0 }
}

export function runJob<J extends Job>(
  engine: Engine,
  job: J,
  progress: (event: JobProgress) => void = () => {},
): JobResults[J['type']] {
  const run = (): JobResults[keyof JobResults] => {
    switch (job.type) {
      case 'run':
        return complete<RunResponse>(engine.call({ kind: 'run', code: job.code, given: job.given }), EMPTY_RUN)
      case 'check':
        return runCheck(engine, job, progress)
      case 'predict':
        return complete<PredictResponse>(
          engine.call({ kind: 'predict', program: job.program, questions: job.questions, answers: job.answers }),
          { ...EMPTY_RUN, results: [], truths: [] },
        )
      case 'trace':
        return complete<TraceResponse>(
          engine.call({ kind: 'trace', code: job.code, given: job.given, maxSteps: job.maxSteps }),
          { ...EMPTY_RUN, steps: [], states: [], pairs: [] },
        )
    }
  }
  return run() as JobResults[J['type']]
}
