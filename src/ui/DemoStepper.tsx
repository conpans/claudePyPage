// A prepared step-through example on a skill page. The program is run by real Python when
// the example is shown, and the steps displayed are what that run recorded.

import { useEffect, useState } from 'preact/hooks'
import { traceJobFor } from '../content/jobs.ts'
import { givenSource } from '../content/python-literal.ts'
import type { Demo } from '../content/schema.ts'
import type { TraceResult } from '../python/protocol.ts'
import { pythonRuntime } from '../python/runtime.ts'
import { CodeBlock } from './CodeBlock.tsx'
import { Stepper } from './Stepper.tsx'

export function DemoStepper({ demo }: { demo: Demo }) {
  const [trace, setTrace] = useState<TraceResult | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const given = givenSource(demo.given)

  useEffect(() => {
    let current = true
    setTrace(null)
    setProblem(null)
    pythonRuntime()
      .submit(traceJobFor(demo.code, given))
      .then(
        (result) => {
          if (current) setTrace(result)
        },
        (error: unknown) => {
          if (current) setProblem(error instanceof Error ? error.message : String(error))
        },
      )
    return () => {
      current = false
    }
  }, [demo, given, attempt])

  if (trace && trace.status !== 'syntax-error' && trace.status !== 'given-error') {
    return (
      <Stepper
        title={demo.title}
        code={demo.code}
        trace={trace}
        kind="prepared"
        givenText={given.trim().replaceAll('\n', ', ')}
        note={demo.note}
      />
    )
  }
  return (
    <section class="stepper stepper--waiting" aria-label={`Step through: ${demo.title}`}>
      <header class="stepper-head">
        <h3>{demo.title}</h3>
        <p class="stepper-kind" role="status">
          {problem
            ? 'This example could not be run.'
            : trace
              ? 'This example could not be run as written.'
              : 'Getting Python ready to run this example. The first start takes a few seconds.'}
        </p>
      </header>
      <CodeBlock code={demo.code} numbered />
      {(problem || trace) && (
        <button
          type="button"
          class="button"
          onClick={() => {
            if (pythonRuntime().getStatus().state === 'failed') pythonRuntime().retry()
            setAttempt((value) => value + 1)
          }}
        >
          Try again
        </button>
      )}
    </section>
  )
}
