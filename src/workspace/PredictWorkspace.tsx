// A prediction exercise: read a prepared program, say what it does, then let real Python
// run it and compare. The true values are not shown for a wrong prediction; the step-through
// lets the learner find them, and using it before answering correctly is recorded as help.

import { useEffect, useRef, useState } from 'preact/hooks'
import { predictJobFor, traceJobFor } from '../content/jobs.ts'
import type { PredictItem } from '../content/schema.ts'
import type { PredictResult, TraceResult } from '../python/protocol.ts'
import { pythonRuntime } from '../python/runtime.ts'
import { store, useRuntimeStatus } from '../state/hooks.ts'
import { currentAttempt, type AppState } from '../state/progress.ts'
import { CodeBlock } from '../ui/CodeBlock.tsx'
import { MOD_KEY } from '../ui/keys.ts'
import { InlineText } from '../ui/Markdown.tsx'
import { Stepper } from '../ui/Stepper.tsx'
import { PassPanel } from './PassPanel.tsx'

interface PredictWorkspaceProps {
  item: PredictItem
  state: AppState
  onFreshAttempt: () => void
}

interface Judged {
  /** The answers that were checked, so stale marks are not shown next to edited answers. */
  answers: string[]
  result: PredictResult
}

export function PredictWorkspace({ item, state, onFreshAttempt }: PredictWorkspaceProps) {
  const runtime = pythonRuntime()
  const status = useRuntimeStatus()
  const answers = item.questions.map((_, index) => state.drafts[item.id]?.answers?.[index] ?? '')
  const attempt = currentAttempt(state.items[item.id])
  const passed = attempt?.passedAt != null

  const [judged, setJudged] = useState<Judged | null>(null)
  const [trace, setTrace] = useState<TraceResult | null>(null)
  const [busy, setBusy] = useState<'check' | 'trace' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [confirmingTrace, setConfirmingTrace] = useState(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const setAnswer = (index: number, value: string) => {
    const next = [...answers]
    next[index] = value
    store.setDraft(item.id, { answers: next }, '')
  }

  const check = () => {
    if (busy) return
    setBusy('check')
    setProblem(null)
    const checked = [...answers]
    runtime.submit(predictJobFor(item, checked)).then(
      (result) => {
        if (!alive.current) return
        setBusy(null)
        if (result.status !== 'ok') {
          setProblem('The prepared program did not run as expected, so your answers could not be checked.')
          return
        }
        setJudged({ answers: checked, result })
        store.recordPredict(item.id, {
          at: new Date().toISOString(),
          answers: checked,
          correct: result.results.map((entry) => entry.correct),
        })
      },
      (error: unknown) => {
        if (!alive.current) return
        setBusy(null)
        setProblem(error instanceof Error ? error.message : String(error))
      },
    )
  }

  const stepThrough = () => {
    if (busy) return
    setBusy('trace')
    setProblem(null)
    setConfirmingTrace(false)
    if (!passed) store.recordStepThrough(item.id)
    runtime.submit(traceJobFor(item.program, '')).then(
      (result) => {
        if (!alive.current) return
        setBusy(null)
        setTrace(result)
      },
      (error: unknown) => {
        if (!alive.current) return
        setBusy(null)
        setProblem(error instanceof Error ? error.message : String(error))
      },
    )
  }

  const waiting = status.state === 'starting' || status.state === 'restarting'

  return (
    <div
      class="code-workspace"
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return
        event.preventDefault()
        check()
      }}
    >
      <div class="editor-frame">
        <p class="mini-label">The program (read it, do not run it yet)</p>
        <CodeBlock code={item.program} numbered label="The program to predict" />
      </div>

      <form
        class="questions"
        onSubmit={(event) => {
          event.preventDefault()
          check()
        }}
      >
        {item.questions.map((question, index) => {
          const fresh = judged !== null && judged.answers[index] === answers[index]
          const verdict = fresh ? judged.result.results[index] : undefined
          const wrongFeedback =
            verdict && verdict.wrongIndex !== null ? question.wrong[verdict.wrongIndex]?.feedback : undefined
          const inputId = `answer-${item.id}-${index}`
          return (
            <div key={index} class={`question${verdict ? (verdict.correct ? ' question--right' : ' question--wrong') : ''}`}>
              <label class="field" for={inputId}>
                <span class="field-label">
                  <InlineText text={question.ask} />
                </span>
              </label>
              {question.about === 'output' ? (
                <textarea
                  id={inputId}
                  class="field-input field-input--code"
                  rows={Math.max(3, question.answer.split('\n').length + 1)}
                  spellcheck={false}
                  value={answers[index]}
                  onInput={(event) => setAnswer(index, event.currentTarget.value)}
                />
              ) : (
                <input
                  id={inputId}
                  class="field-input field-input--code"
                  type="text"
                  spellcheck={false}
                  autocomplete="off"
                  value={answers[index]}
                  onInput={(event) => setAnswer(index, event.currentTarget.value)}
                />
              )}
              {verdict && (
                <div class="verdict" role="status">
                  {verdict.blank ? (
                    <p>No answer yet.</p>
                  ) : verdict.correct ? (
                    <p class="verdict-right">
                      <span aria-hidden="true">✓</span> That is what Python does.
                      {verdict.note && (
                        <>
                          {' '}
                          <InlineText text={verdict.note} />
                        </>
                      )}
                    </p>
                  ) : (
                    <>
                      <p class="verdict-wrong">
                        <span aria-hidden="true">✗</span> That is not what the program does.
                      </p>
                      {wrongFeedback && (
                        <p>
                          <InlineText text={wrongFeedback} />
                        </p>
                      )}
                      {!wrongFeedback && verdict.note && (
                        <p>
                          <InlineText text={verdict.note} />
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        <div class="toolbar">
          <button type="submit" class="button button--primary" disabled={busy !== null}>
            Check my answers <span class="keys">{MOD_KEY}+Enter</span>
          </button>
          {passed || trace ? (
            <button type="button" class="button" onClick={stepThrough} disabled={busy !== null}>
              Step through the program
            </button>
          ) : (
            <button type="button" class="button" onClick={() => setConfirmingTrace(true)} disabled={busy !== null}>
              Step through the program
            </button>
          )}
          <span class="toolbar-status" role="status">
            {busy && waiting && 'Python is starting. This takes a few seconds the first time.'}
            {busy === 'check' && !waiting && 'Running the program to compare…'}
            {busy === 'trace' && !waiting && 'Recording each step…'}
          </span>
        </div>
      </form>

      {confirmingTrace && !passed && (
        <div class="notice">
          <p>
            Stepping through shows every value as Python works it out, so it also shows the answers. If you use it before
            your answers are right, this attempt is recorded as passed with help. It is a good way to find where your trace
            and Python's part ways.
          </p>
          <div class="button-row">
            <button type="button" class="button" onClick={stepThrough}>
              Step through anyway
            </button>
            <button type="button" class="button button--quiet" onClick={() => setConfirmingTrace(false)}>
              Keep predicting first
            </button>
          </div>
        </div>
      )}

      {problem && (
        <div class="trouble" role="alert">
          <p class="trouble-summary">Something went wrong while running the program.</p>
          <p class="quiet">{problem}</p>
        </div>
      )}

      {attempt?.passedAt && <PassPanel item={item} attempt={attempt} state={state} onFreshAttempt={onFreshAttempt} />}

      {trace && <Stepper title="The program, step by step" code={item.program} trace={trace} kind="prepared" givenText="" />}
    </div>
  )
}
