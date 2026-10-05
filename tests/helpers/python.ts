// Loads real Python (Pyodide, the same build the browser uses) under Node for the tests.

import { Worker } from 'node:worker_threads'
import { loadPyodide } from 'pyodide'
import { createEngine, type Engine } from '../../src/python/engine.ts'
import harnessSource from '../../src/python/harness.py?raw'

export interface TestPython {
  engine: Engine
  /**
   * Ask the running Python program to stop after `ms`, the way the page's Stop button does.
   * Call the returned function once the program has ended, so a signal that was not needed
   * cannot hit a later program.
   */
  interruptAfter(ms: number): () => void
  /** Run Python with the harness's own functions in scope, and return the last expression. */
  insideHarness(code: string): unknown
}

export async function startPython(): Promise<TestPython> {
  const pyodide = await loadPyodide()
  const engine = createEngine(pyodide, harnessSource)
  const shared = new SharedArrayBuffer(4)
  const buffer = new Int32Array(shared)
  pyodide.setInterruptBuffer(buffer)
  const harness = pyodide.toPy({})
  pyodide.runPython(harnessSource, { globals: harness, filename: 'harness.py' })
  return {
    engine,
    interruptAfter(ms: number) {
      // Python blocks this thread while it runs, so the signal has to come from another one.
      const timer = new Worker(
        `const { workerData } = require('node:worker_threads')
         setTimeout(() => { new Int32Array(workerData.shared)[0] = 2 }, workerData.ms)`,
        { eval: true, workerData: { shared, ms } },
      )
      return () => {
        void timer.terminate()
        Atomics.store(buffer, 0, 0)
      }
    },
    insideHarness(code: string) {
      return pyodide.runPython(code, { globals: harness })
    },
  }
}
