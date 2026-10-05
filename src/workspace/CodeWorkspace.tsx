// The right-hand side of a coding exercise: given values, the editor, and the three actions.
//   Run            tries the code once with the given values shown above the editor
//   Check          runs the item's tests, each in a fresh Python namespace
//   Step through   records a real run line by line and shows it in the stepper

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { checkJobFor, runJobFor, traceJobFor } from '../content/jobs.ts'
import { givenSource } from '../content/python-literal.ts'
import type { CodeItem } from '../content/schema.ts'
import type { CheckResult, RunResult, TraceResult } from '../python/protocol.ts'
import { pythonRuntime } from '../python/runtime.ts'
import { store, useRuntimeStatus } from '../state/hooks.ts'
import { currentAttempt, type AppState, type CheckRecord } from '../state/progress.ts'
import { when } from '../state/recommend.ts'
import { CodeEditor } from '../ui/CodeEditor.tsx'
import { MOD_KEY } from '../ui/keys.ts'
import { InlineText } from '../ui/Markdown.tsx'
import { Stepper } from '../ui/Stepper.tsx'
import { PassPanel } from './PassPanel.tsx'
import { firstProblem, isUnchangedStarter, toCheckRecord } from './records.ts'
import { CheckView, RunView } from './ResultsView.tsx'

type View =
  | { kind: 'run'; result: RunResult }
  | { kind: 'check'; result: CheckResult; unchangedStarter: boolean }
  | { kind: 'trace'; result: TraceResult; code: string; given: string; title: string }
  | { kind: 'problem'; message: string }

type Busy = 'run' | 'check' | 'trace'

interface CodeWorkspaceProps {
  item: CodeItem
  state: AppState
  onFreshAttempt: () => void
}

function oneLine(given: string): string {
  return given.trim().replaceAll('\n', ', ')
}

/** What the last check found, shown when the learner comes back to an item. */
function LastCheck({ record }: { record: CheckRecord }) {
  const problem = record.problem
  return (
    <div class="results results--saved">
      <h3 class="results-title">
        Your last check, {when(record.at, new Date())}: {record.passedCount} of {record.total} tests passed
      </h3>
      {problem && (
        <>
          <p>
            The first test that did not pass was "{problem.name}"
            {problem.given.trim() !== '' && (
              <>
                , with <code>{oneLine(problem.given)}</code>
              </>
            )}
            .
          </p>
          {problem.lines.map((line) => (
            <p key={line.target}>
              Expected <code>{line.target}</code> to be <code>{line.expected}</code>;{' '}
              {line.missing ? (
                'your code did not create it.'
              ) : (
                <>
                  yours was <code>{line.actual}</code>.
                </>
              )}
            </p>
          ))}
          {problem.error && (
            <p>
              Python reported <code>{`${problem.error.type}: ${problem.error.message}`}</code>
              {problem.error.line ? ` on line ${problem.error.line}` : ''}.
            </p>
          )}
          {problem.feedback && (
            <p>
              <InlineText text={problem.feedback} />
            </p>
          )}
        </>
      )}
      <p class="quiet">Check again to see the full results for your code as it is now.</p>
    </div>
  )
}

export function CodeWorkspace({ item, state, onFreshAttempt }: CodeWorkspaceProps) {
  const runtime = pythonRuntime()
  const status = useRuntimeStatus()
  const draft = state.drafts[item.id]
  const code = draft?.code ?? item.starter
  const exampleGiven = useMemo(() => givenSource(item.exampleGiven), [item])
  const given = draft?.given ?? exampleGiven
  const attempt = currentAttempt(state.items[item.id])

  const [view, setView] = useState<View | null>(null)
  const [busy, setBusy] = useState<Busy | null>(null)
  const [testProgress, setTestProgress] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [editorRevision, setEditorRevision] = useState(0)
  // Each action gets a number. A result is only shown if no newer action has replaced it.
  const turn = useRef(0)
  const running = useRef(false)

  // The page gives this component a new key for each exercise and each fresh attempt, so
  // this runs once when the learner leaves: a program that is still running is no longer wanted.
  useEffect(
    () => () => {
      turn.current += 1
      if (running.current) runtime.stop()
    },
    [runtime],
  )

  const begin = (kind: Busy): number => {
    turn.current += 1
    running.current = true
    setBusy(kind)
    setTestProgress('')
    setAnnouncement('')
    return turn.current
  }

  const finish = (mine: number, next: View, spoken: string) => {
    if (turn.current !== mine) return
    running.current = false
    setView(next)
    setBusy(null)
    setAnnouncement(spoken)
  }

  const fail = (mine: number, error: unknown) => {
    finish(mine, { kind: 'problem', message: error instanceof Error ? error.message : String(error) }, 'Python could not run the code.')
  }

  const run = () => {
    if (busy) return
    const mine = begin('run')
    store.recordRun(item.id)
    runtime.submit(runJobFor(code, given)).then(
      (result) => finish(mine, { kind: 'run', result }, result.status === 'ok' ? 'Run finished. The program ran to the end.' : 'Run finished. The program did not finish.'),
      (error: unknown) => fail(mine, error),
    )
  }

  const check = () => {
    if (busy) return
    const mine = begin('check')
    const checkedCode = code
    runtime
      .submit(checkJobFor(item, checkedCode), (event) => {
        if (event.kind === 'test-start' && turn.current === mine) setTestProgress(`Test ${event.index + 1} of ${item.tests.length}`)
      })
      .then(
        (result) => {
          if (turn.current !== mine) return
          const record = toCheckRecord(item, result, checkedCode, new Date().toISOString())
          store.recordCheck(item.id, record, checkedCode)
          finish(
            mine,
            { kind: 'check', result, unchangedStarter: isUnchangedStarter(item, checkedCode) },
            result.passed ? `Check finished. All ${record.total} tests passed.` : `Check finished. ${record.passedCount} of ${record.total} tests passed.`,
          )
        },
        (error: unknown) => fail(mine, error),
      )
  }

  const stepThrough = (traceGiven: string, title: string) => {
    if (busy) return
    const mine = begin('trace')
    const tracedCode = code
    runtime.submit(traceJobFor(tracedCode, traceGiven)).then(
      (result) => finish(mine, { kind: 'trace', result, code: tracedCode, given: traceGiven, title }, 'The step-through is ready.'),
      (error: unknown) => fail(mine, error),
    )
  }

  let problemLine: number | null = null
  if (view?.kind === 'run') problemLine = view.result.error?.line ?? view.result.stopLine
  if (view?.kind === 'check') {
    const problem = firstProblem(view.result)
    problemLine = problem?.error?.line ?? problem?.stopLine ?? null
  }
  if (view?.kind === 'trace') problemLine = view.result.error?.line ?? null

  const waitingForPython = status.state === 'starting' || status.state === 'restarting'
  let statusText = ''
  if (busy && waitingForPython) statusText = 'Python is starting. Your code will run as soon as it is ready.'
  else if (busy === 'run') statusText = 'Running…'
  else if (busy === 'check') statusText = testProgress ? `Checking. ${testProgress}…` : 'Checking…'
  else if (busy === 'trace') statusText = 'Recording each step…'
  else if (status.state === 'failed') statusText = 'Python could not start.'

  return (
    <div
      class="code-workspace"
      onKeyDown={(event) => {
        // The editor handles these keys itself. This catches them everywhere else on the panel.
        if (event.defaultPrevented || event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return
        event.preventDefault()
        if (event.shiftKey) check()
        else run()
      }}
    >
      {item.given.length > 0 && (
        <div class="given">
          <label class="field">
            <span class="field-label">Given values</span>
            <span class="field-help">
              Run and Step through use these. Change them to try your own. Check uses its own values for each test.
            </span>
            <textarea
              class="field-input field-input--code"
              rows={Math.max(1, given.trimEnd().split('\n').length)}
              spellcheck={false}
              value={given}
              onInput={(event) => store.setDraft(item.id, { given: event.currentTarget.value }, item.starter)}
            />
          </label>
          {given !== exampleGiven && (
            <button type="button" class="link-button" onClick={() => store.setDraft(item.id, { given: null }, item.starter)}>
              Use the example values again
            </button>
          )}
        </div>
      )}

      <div class="editor-frame">
        <p class="mini-label" id="editor-label">
          Your code
        </p>
        <CodeEditor
          value={code}
          revision={editorRevision}
          label={`Your code for ${item.title}`}
          onChange={(next) => store.setDraft(item.id, { code: next }, item.starter)}
          onRun={run}
          onCheck={check}
          problemLine={problemLine}
        />
        <p class="editor-help">
          Tab indents. To leave the editor with the keyboard, press Esc and then Tab. Your code is saved as you type.
        </p>
      </div>

      <div class="toolbar">
        <button type="button" class="button button--primary" onClick={run} disabled={busy !== null}>
          Run <span class="keys">{MOD_KEY}+Enter</span>
        </button>
        <button type="button" class="button button--primary" onClick={check} disabled={busy !== null}>
          Check <span class="keys">{MOD_KEY}+Shift+Enter</span>
        </button>
        <button type="button" class="button" onClick={() => stepThrough(given, 'Your code, step by step')} disabled={busy !== null}>
          Step through
        </button>
        {busy !== null && (
          <button type="button" class="button button--stop" onClick={() => runtime.stop()}>
            Stop
          </button>
        )}
        <span class="toolbar-status" role="status">
          {statusText}
        </span>
        {status.state === 'failed' && (
          <button type="button" class="button" onClick={() => runtime.retry()}>
            Start Python again
          </button>
        )}
      </div>
      <p class="visually-hidden" role="status">
        {announcement}
      </p>

      {attempt?.passedAt && <PassPanel item={item} attempt={attempt} state={state} onFreshAttempt={onFreshAttempt} />}

      {view?.kind === 'run' && <RunView result={view.result} item={item} />}
      {view?.kind === 'check' && (
        <CheckView
          result={view.result}
          item={item}
          unchangedStarter={view.unchangedStarter}
          onStepThrough={(testGiven, name) => stepThrough(testGiven, `Your code with the test "${name}"`)}
        />
      )}
      {view?.kind === 'trace' &&
        (view.result.status === 'syntax-error' || view.result.status === 'given-error' ? (
          <RunView result={view.result} item={item} />
        ) : (
          <Stepper title={view.title} code={view.code} trace={view.result} kind="own" givenText={oneLine(view.given)} />
        ))}
      {view?.kind === 'problem' && (
        <div class="trouble" role="alert">
          <p class="trouble-summary">Python stopped unexpectedly while running the code.</p>
          <p>
            Python has been restarted and your code is still saved. This usually means the program used up all the memory
            it may have, for example by adding to a list without end. Check the loop's condition, then try again.
          </p>
          <p class="quiet">Technical detail: {view.message}</p>
        </div>
      )}
      {view === null && busy === null && attempt?.lastCheck && !attempt.passedAt && <LastCheck record={attempt.lastCheck} />}
      {view === null && busy === null && !attempt?.lastCheck && (
        <p class="results-hint">
          Run tries your code with the given values and shows what it printed and what each variable holds. Check tests it
          with several sets of values.
        </p>
      )}

      <div class="workspace-footer">
        {confirmingReset ? (
          <span class="button-row">
            <span>Replace your code with the starter code?</span>
            <button
              type="button"
              class="button"
              onClick={() => {
                store.setDraft(item.id, { code: item.starter }, item.starter)
                setEditorRevision((value) => value + 1)
                setConfirmingReset(false)
                setView(null)
              }}
            >
              Yes, reset the code
            </button>
            <button type="button" class="button button--quiet" onClick={() => setConfirmingReset(false)}>
              Keep my code
            </button>
          </span>
        ) : (
          code.trim() !== item.starter.trim() && (
            <button type="button" class="link-button" onClick={() => setConfirmingReset(true)}>
              Reset the code to the starter
            </button>
          )
        )}
      </div>
    </div>
  )
}
