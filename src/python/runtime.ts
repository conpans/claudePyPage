// The page's side of Python execution: owns the worker, queues jobs, enforces time limits,
// and recovers when a program has to be stopped.
//
// Stopping works in two stages. First the page asks politely: it writes a stop signal into a
// buffer shared with the worker, and Python raises KeyboardInterrupt inside the running
// program. The interpreter survives, so the output and the variables at that moment can be
// shown. If the program does not stop within a short grace period (or the browser does not
// allow shared buffers), the worker is discarded and a new interpreter is started.

import type {
  CheckJob,
  FromWorker,
  Job,
  JobProgress,
  JobResults,
  ResultOf,
  RunResponse,
  StopReason,
  TestOutcome,
  ToWorker,
} from './protocol.ts'

export type RuntimeStatus =
  | { state: 'starting' }
  | { state: 'ready'; pythonVersion: string }
  | { state: 'busy'; pythonVersion: string }
  | { state: 'restarting' }
  | { state: 'failed'; message: string }

export interface RuntimeLimits {
  /** Time allowed for a single run, prediction or step-through. */
  runMs: number
  /** Time allowed for each test of a check. */
  testMs: number
  /** How long to wait after asking a program to stop before discarding the interpreter. */
  graceMs: number
}

export const DEFAULT_LIMITS: RuntimeLimits = { runMs: 4000, testMs: 3000, graceMs: 1500 }

const SIGINT = 2

interface Pending {
  id: number
  job: Job
  onProgress: (progress: JobProgress) => void
  resolve: (result: JobResults[keyof JobResults]) => void
  reject: (error: Error) => void
}

interface Active extends Pending {
  limitTimer: ReturnType<typeof setTimeout> | null
  killTimer: ReturnType<typeof setTimeout> | null
  stopReason: StopReason | null
  completedTests: TestOutcome[]
  activeTest: number | null
}

const STOPPED_RUN: RunResponse = {
  status: 'stopped',
  error: null,
  stopLine: null,
  stdout: '',
  outputTruncated: false,
  variables: [],
}

export class PythonRuntime {
  private worker: Worker | null = null
  private status: RuntimeStatus = { state: 'starting' }
  private readonly listeners = new Set<(status: RuntimeStatus) => void>()
  private readonly queue: Pending[] = []
  private active: Active | null = null
  private nextId = 1
  private pythonVersion = ''
  private readonly interrupt: Int32Array | null
  private readonly limits: RuntimeLimits

  constructor(limits: RuntimeLimits = DEFAULT_LIMITS) {
    this.limits = limits
    const canShare = typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true
    this.interrupt = canShare ? new Int32Array(new SharedArrayBuffer(4)) : null
  }

  /** Whether a running program can be interrupted without discarding the interpreter. */
  get canInterrupt(): boolean {
    return this.interrupt !== null
  }

  getStatus(): RuntimeStatus {
    return this.status
  }

  subscribe(listener: (status: RuntimeStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Start loading Python. Safe to call more than once. */
  start(): void {
    if (this.worker) return
    this.spawn('starting')
  }

  /** Start again after a failure. */
  retry(): void {
    this.worker?.terminate()
    this.worker = null
    this.spawn('starting')
  }

  submit<J extends Job>(job: J, onProgress: (progress: JobProgress) => void = () => {}): Promise<ResultOf<J>> {
    this.start()
    return new Promise<ResultOf<J>>((resolve, reject) => {
      this.queue.push({
        id: this.nextId++,
        job,
        onProgress,
        resolve: resolve as (result: JobResults[keyof JobResults]) => void,
        reject,
      })
      this.pump()
    })
  }

  /** Stop the program that is running now (the Stop button). */
  stop(): void {
    if (this.active) this.requestStop('user')
  }

  get isBusy(): boolean {
    return this.active !== null || this.queue.length > 0
  }

  // -------------------------------------------------------------------------------------

  private setStatus(status: RuntimeStatus): void {
    this.status = status
    for (const listener of this.listeners) listener(status)
  }

  private spawn(state: 'starting' | 'restarting'): void {
    this.setStatus({ state })
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      if (this.worker === worker) this.receive(event.data)
    }
    worker.onerror = (event) => {
      if (this.worker !== worker) return
      event.preventDefault()
      this.workerBroke(event.message || 'The Python worker stopped unexpectedly.')
    }
    const boot: ToWorker = {
      type: 'boot',
      baseUrl: document.baseURI,
      interruptBuffer: this.interrupt ? (this.interrupt.buffer as SharedArrayBuffer) : null,
    }
    worker.postMessage(boot)
  }

  private receive(message: FromWorker): void {
    switch (message.type) {
      case 'ready':
        this.pythonVersion = message.pythonVersion
        this.setStatus({ state: 'ready', pythonVersion: this.pythonVersion })
        this.pump()
        return
      case 'boot-failed':
        this.worker?.terminate()
        this.worker = null
        this.setStatus({ state: 'failed', message: message.message })
        this.rejectAll(new Error(`Python could not start: ${message.message}`))
        return
      case 'started': {
        // The worker clears the stop signal when a job begins. If the stop for this very job
        // was requested before that moment, the signal was wiped, so send it again now.
        const active = this.active
        if (active && active.id === message.jobId && active.stopReason !== null) this.signalStop()
        return
      }
      case 'progress': {
        const active = this.active
        if (!active || active.id !== message.jobId) return
        if (message.progress.kind === 'test-start') {
          active.activeTest = message.progress.index
          // Each test gets its own time allowance.
          if (active.stopReason === null) this.armLimit(active, this.limits.testMs)
        } else {
          active.completedTests[message.progress.index] = message.progress.outcome
          active.activeTest = null
        }
        active.onProgress(message.progress)
        return
      }
      case 'done': {
        const active = this.active
        if (!active || active.id !== message.jobId) return
        this.finish(active, this.markStopped(message.result, active.stopReason, false))
        return
      }
      case 'crashed': {
        const active = this.active
        if (!active || active.id !== message.jobId) return
        if (active.stopReason !== null) {
          // The stop signal landed outside the program. Treat it as a stop, with nothing to show.
          this.finish(active, this.stoppedResult(active, false))
        } else {
          // Something went wrong inside the worker itself. The interpreter may be unusable
          // (Pyodide refuses to continue after a fatal error), so start a fresh one.
          this.workerBroke(message.message)
        }
        return
      }
    }
  }

  private pump(): void {
    if (this.active || this.queue.length === 0) return
    if (this.status.state !== 'ready' || !this.worker) return
    const next = this.queue.shift()
    if (!next) return
    const active: Active = {
      ...next,
      limitTimer: null,
      killTimer: null,
      stopReason: null,
      completedTests: [],
      activeTest: null,
    }
    this.active = active
    this.setStatus({ state: 'busy', pythonVersion: this.pythonVersion })
    if (this.interrupt) Atomics.store(this.interrupt, 0, 0)
    this.armLimit(active, active.job.type === 'check' ? this.limits.testMs : this.limits.runMs)
    const message: ToWorker = { type: 'job', jobId: active.id, job: active.job }
    this.worker.postMessage(message)
  }

  private armLimit(active: Active, ms: number): void {
    if (active.limitTimer !== null) clearTimeout(active.limitTimer)
    active.limitTimer = setTimeout(() => {
      if (this.active === active) this.requestStop('time-limit')
    }, ms)
  }

  private requestStop(reason: StopReason): void {
    const active = this.active
    if (!active || active.stopReason !== null) return
    active.stopReason = reason
    if (active.limitTimer !== null) clearTimeout(active.limitTimer)
    active.limitTimer = null
    if (!this.interrupt) {
      this.hardStop(active)
      return
    }
    // Ask Python to stop: once. Repeating the signal on a timer would hit the harness while
    // it gathers the output and variables of the program it has just stopped.
    this.signalStop()
    active.killTimer = setTimeout(() => {
      if (this.active === active) this.hardStop(active)
    }, this.limits.graceMs)
  }

  private signalStop(): void {
    if (this.interrupt) Atomics.store(this.interrupt, 0, SIGINT)
  }

  private hardStop(active: Active): void {
    this.worker?.terminate()
    this.worker = null
    this.finish(active, this.stoppedResult(active, true), false)
    this.spawn('restarting')
  }

  private workerBroke(message: string): void {
    this.worker?.terminate()
    this.worker = null
    const active = this.active
    if (active) {
      this.clearTimers(active)
      this.active = null
      if (active.stopReason !== null) active.resolve(this.stoppedResult(active, true))
      else active.reject(new Error(message))
    }
    this.spawn('restarting')
  }

  private finish(active: Active, result: JobResults[keyof JobResults], continueQueue = true): void {
    this.clearTimers(active)
    this.active = null
    if (this.interrupt) Atomics.store(this.interrupt, 0, 0)
    active.resolve(result)
    if (continueQueue) this.afterJob()
  }

  private afterJob(): void {
    if (this.status.state === 'busy') this.setStatus({ state: 'ready', pythonVersion: this.pythonVersion })
    this.pump()
  }

  private clearTimers(active: Active): void {
    if (active.limitTimer !== null) clearTimeout(active.limitTimer)
    if (active.killTimer !== null) clearTimeout(active.killTimer)
    active.limitTimer = active.killTimer = null
  }

  private rejectAll(error: Error): void {
    const active = this.active
    if (active) {
      this.clearTimers(active)
      this.active = null
      active.reject(error)
    }
    for (const pending of this.queue.splice(0)) pending.reject(error)
  }

  /** Label results that ended because the page asked the program to stop. */
  private markStopped(
    result: JobResults[keyof JobResults],
    reason: StopReason | null,
    hardStop: boolean,
  ): JobResults[keyof JobResults] {
    if (reason === null) return result
    if ('tests' in result) {
      return {
        ...result,
        tests: result.tests.map((test) =>
          test.ran && test.status === 'stopped' ? { ...test, stopReason: reason, hardStop } : test,
        ),
      }
    }
    return result.status === 'stopped' ? { ...result, stopReason: reason, hardStop } : result
  }

  /** The result to report when the program was stopped and the harness could not answer. */
  private stoppedResult(active: Active, hardStop: boolean): JobResults[keyof JobResults] {
    const stopReason = active.stopReason ?? 'time-limit'
    const job = active.job
    switch (job.type) {
      case 'run':
        return { ...STOPPED_RUN, stopReason, hardStop }
      case 'predict':
        return { ...STOPPED_RUN, results: [], truths: [], stopReason, hardStop }
      case 'trace':
        return { ...STOPPED_RUN, steps: [], states: [], pairs: [], stopReason, hardStop }
      case 'check':
        return this.stoppedCheck(job, active, stopReason, hardStop)
    }
  }

  private stoppedCheck(job: CheckJob, active: Active, stopReason: StopReason, hardStop: boolean) {
    const stoppedAt = active.activeTest ?? active.completedTests.length
    const tests: TestOutcome[] = job.tests.map((test, index) => {
      const done = active.completedTests[index]
      if (done) return done
      const label = { name: test.name, purpose: test.purpose, given: test.given }
      if (index === stoppedAt) {
        return { ran: true, ...label, ...STOPPED_RUN, status: 'stopped', checks: [], mistakeId: null, stopReason, hardStop }
      }
      return { ran: false, ...label }
    })
    return { inspection: { parsed: true, forbidden: [], hardCoded: [] }, tests, passed: false }
  }
}

let shared: PythonRuntime | null = null

/** The one runtime the whole page uses. */
export function pythonRuntime(): PythonRuntime {
  shared ??= new PythonRuntime()
  return shared
}
