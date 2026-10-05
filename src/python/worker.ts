// The Python worker. It loads Pyodide from this computer (public/pyodide), loads harness.py,
// and then runs one job at a time. Running Python here keeps the page responsive, and the
// browser's worker sandbox means learner code cannot reach files on the computer.

import { createEngine, runJob, type Engine, type PyodideLike } from './engine.ts'
import harnessSource from './harness.py?raw'
import type { FromWorker, ToWorker } from './protocol.ts'

interface WorkerScope {
  postMessage(message: FromWorker): void
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null
}

interface PyodideRuntime extends PyodideLike {
  setInterruptBuffer(buffer: Int32Array): void
}

interface PyodideModule {
  loadPyodide(options: { indexURL: string }): Promise<PyodideRuntime>
}

const scope = self as unknown as WorkerScope

let engine: Engine | null = null
let interrupt: Int32Array | null = null

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function boot(baseUrl: string, interruptBuffer: SharedArrayBuffer | null): Promise<Engine> {
  const moduleUrl = new URL('pyodide/pyodide.mjs', baseUrl).href
  const pyodideModule = (await import(/* @vite-ignore */ moduleUrl)) as PyodideModule
  const pyodide = await pyodideModule.loadPyodide({ indexURL: new URL('pyodide/', baseUrl).href })
  const loaded = createEngine(pyodide, harnessSource)
  if (interruptBuffer) {
    // Writing 2 (SIGINT) into this shared buffer raises KeyboardInterrupt inside running Python.
    interrupt = new Int32Array(interruptBuffer)
    pyodide.setInterruptBuffer(interrupt)
  }
  return loaded
}

scope.onmessage = (event) => {
  const message = event.data
  if (message.type === 'boot') {
    boot(message.baseUrl, message.interruptBuffer).then(
      (loaded) => {
        engine = loaded
        scope.postMessage({ type: 'ready', pythonVersion: loaded.pythonVersion })
      },
      (error: unknown) => scope.postMessage({ type: 'boot-failed', message: describe(error) }),
    )
    return
  }

  const { jobId, job } = message
  if (!engine) {
    scope.postMessage({ type: 'crashed', jobId, message: 'Python has not finished starting.' })
    return
  }
  // A stop request that arrived after the previous job finished must not hit this one.
  // The page is told once the signal is cleared, so that it can repeat a stop request it
  // made for THIS job before the job had begun.
  if (interrupt) Atomics.store(interrupt, 0, 0)
  scope.postMessage({ type: 'started', jobId })
  try {
    const result = runJob(engine, job, (progress) => scope.postMessage({ type: 'progress', jobId, progress }))
    scope.postMessage({ type: 'done', jobId, result })
  } catch (error) {
    scope.postMessage({ type: 'crashed', jobId, message: describe(error) })
  }
}
