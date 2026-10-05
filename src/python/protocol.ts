// Types for everything that crosses between the page, the Python worker and harness.py.
// The first half mirrors the JSON that harness.py returns. The second half describes jobs:
// the units of work the page asks the worker to do.

export type ValueKind =
  | 'none'
  | 'bool'
  | 'int'
  | 'float'
  | 'str'
  | 'list'
  | 'tuple'
  | 'dict'
  | 'set'
  | 'function'
  | 'other'

/** A Python value as plain data. `text` is how Python would display it. */
export interface EncodedValue {
  kind: ValueKind
  text: string
  length?: number
  items?: EncodedValue[]
  typeName?: string
}

export interface VariableView {
  name: string
  value: EncodedValue
  /** True for variables that were given to the program rather than created by it. */
  given: boolean
}

export interface ErrorInfo {
  type: string
  message: string
  line: number | null
  column: number | null
  lineText: string | null
}

/**
 * How a run ended.
 * - ok: ran to the end
 * - error: Python raised an exception while running
 * - syntax-error: Python could not read the code, so nothing ran
 * - given-error: the given values themselves were not valid Python
 * - stopped: interrupted (time limit or the Stop button)
 * - output-limit: it printed more than the limit, so it was stopped
 * - trace-limit: a step-through recorded its maximum number of steps
 */
export type RunStatus = 'ok' | 'error' | 'syntax-error' | 'given-error' | 'stopped' | 'output-limit' | 'trace-limit'

export interface RunResponse {
  status: RunStatus
  error: ErrorInfo | null
  stopLine: number | null
  stdout: string
  outputTruncated: boolean
  variables: VariableView[]
}

/** What a test expects. Variable values are Python literals written as source text. */
export interface Expectation {
  variables: Record<string, string>
  stdout: string | null
}

/** A prepared wrong solution, used to recognise a specific mistake and explain it. */
export interface MistakeProbe {
  id: string
  code: string
  /** values: same wrong result; error: same exception type; stopped: never finishes. */
  match: 'values' | 'error' | 'stopped'
  errorType?: string
  /** For `error`: text the message must contain, to tell two causes of one error type apart. */
  errorContains?: string
}

export interface CheckLine {
  kind: 'variable' | 'stdout' | 'unchanged' | 'fresh' | 'in-place'
  target: string
  ok: boolean
  missing: boolean
  expected: string | null
  actual: string | null
  note: string | null
  similar: string[]
}

export type TestStatus = 'pass' | 'fail' | Exclude<RunStatus, 'ok' | 'trace-limit'>

export interface TestResponse extends Omit<RunResponse, 'status'> {
  status: TestStatus
  checks: CheckLine[]
  mistakeId: string | null
}

export interface PredictQuestionProbe {
  about: 'output' | 'value'
  expression?: string
  /** Prepared wrong answers that have their own feedback. */
  wrong: string[]
}

export interface PredictJudgement {
  correct: boolean
  blank: boolean
  note: string | null
  wrongIndex: number | null
  broken: string | null
}

export interface PredictResponse extends RunResponse {
  results: PredictJudgement[]
  /** What really happened, as text. The page decides whether to show it. */
  truths: (string | null)[]
}

export interface Insight {
  source: string
  role: 'condition' | 'value'
  value: EncodedValue | null
  error: string | null
}

export interface TraceStep {
  line: number
  insights: Insight[]
}

export interface TraceState {
  variables: VariableView[]
  outputLength: number
}

export interface TraceResponse extends RunResponse {
  /** Executed lines in order. Step i ran with states[i] before it and states[i + 1] after it. */
  steps: TraceStep[]
  states: TraceState[]
  /** (list, index) name pairs written as `list[index]` somewhere in the code. */
  pairs: { list: string; index: string }[]
}

export interface InspectResponse {
  parsed: boolean
  forbidden: { what: string; line: number }[]
  hardCoded: { name: string; line: number }[]
}

// ---------------------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------------------

export interface CheckTest {
  name: string
  purpose: string
  /** Python source that sets the given variables for this test. */
  given: string
  expect: Expectation
}

export interface RunJob {
  type: 'run'
  code: string
  given: string
}

export interface CheckJob {
  type: 'check'
  code: string
  givenNames: string[]
  forbid: string[]
  unchanged: string[]
  fresh: string[]
  inPlace: string[]
  tests: CheckTest[]
  mistakes: MistakeProbe[]
}

export interface PredictJob {
  type: 'predict'
  program: string
  questions: PredictQuestionProbe[]
  answers: string[]
}

export interface TraceJob {
  type: 'trace'
  code: string
  given: string
  maxSteps: number
}

export type Job = RunJob | CheckJob | PredictJob | TraceJob

/** Why a program was stopped from outside. */
export type StopReason = 'time-limit' | 'user'

export interface StopDetails {
  stopReason?: StopReason
  /** True when the interpreter had to be thrown away, so output and variables were lost. */
  hardStop?: boolean
}

export type RunResult = RunResponse & StopDetails
export type TraceResult = TraceResponse & StopDetails
export type PredictResult = PredictResponse & StopDetails

export type TestOutcome =
  | (TestResponse & StopDetails & { ran: true; name: string; purpose: string; given: string })
  | { ran: false; name: string; purpose: string; given: string }

export interface CheckResult {
  inspection: InspectResponse
  tests: TestOutcome[]
  /** Every test passed and no stated restriction was broken. */
  passed: boolean
}

export interface JobResults {
  run: RunResult
  check: CheckResult
  predict: PredictResult
  trace: TraceResult
}

export type ResultOf<J extends Job> = JobResults[J['type']]

export type JobProgress = { kind: 'test-start'; index: number } | { kind: 'test-done'; index: number; outcome: TestOutcome }

// Messages between the page and the worker.

export type ToWorker =
  | { type: 'boot'; baseUrl: string; interruptBuffer: SharedArrayBuffer | null }
  | { type: 'job'; jobId: number; job: Job }

export type FromWorker =
  | { type: 'ready'; pythonVersion: string }
  | { type: 'boot-failed'; message: string }
  /** The worker has cleared the stop signal and is about to run this job. */
  | { type: 'started'; jobId: number }
  | { type: 'progress'; jobId: number; progress: JobProgress }
  | { type: 'done'; jobId: number; result: JobResults[keyof JobResults] }
  | { type: 'crashed'; jobId: number; message: string }
