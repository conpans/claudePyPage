// Step through a real run of a program, one executed line at a time.
//
// Every state shown here was recorded by Python itself while the program ran (see
// handle_trace in harness.py). Nothing is animated from a script: for a prepared example the
// program is run when the stepper opens, and for the learner's code it is their code that ran.

import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import type { EncodedValue, Insight, TraceResult, TraceState, VariableView } from '../python/protocol.ts'
import { explainError, explainStop } from '../workspace/explain.ts'
import { CodeBlock } from './CodeBlock.tsx'
import { ListStrip, type Pointer } from './ListStrip.tsx'
import { InlineText } from './Markdown.tsx'

interface StepperProps {
  title: string
  code: string
  trace: TraceResult
  /** `prepared`: an example shipped with the app. `own`: the learner's current code. */
  kind: 'prepared' | 'own'
  /** The given values the program ran with, as one line of text. Empty when there are none. */
  givenText: string
  note?: string | null
}

interface Change {
  name: string
  before: EncodedValue | null
  after: EncodedValue
}

function findChanges(before: TraceState, after: TraceState): Change[] {
  const earlier = new Map(before.variables.map((entry) => [entry.name, entry.value]))
  const changes: Change[] = []
  for (const entry of after.variables) {
    const old = earlier.get(entry.name)
    if (old === undefined) changes.push({ name: entry.name, before: null, after: entry.value })
    else if (old.text !== entry.value.text || old.kind !== entry.value.kind) {
      changes.push({ name: entry.name, before: old, after: entry.value })
    }
  }
  return changes
}

function describeChange(change: Change): ComponentChildren {
  const { name, before, after } = change
  if (before === null) {
    return (
      <>
        <code>{name}</code> was created. It holds <code>{after.text}</code>.
      </>
    )
  }
  if (before.kind === 'list' && after.kind === 'list' && before.length !== undefined && after.length !== undefined) {
    if (after.length === before.length + 1) {
      return (
        <>
          <code>{name}</code> got one more item at the end. It is now <code>{after.text}</code>.
        </>
      )
    }
  }
  return (
    <>
      <code>{name}</code> changed from <code>{before.text}</code> to <code>{after.text}</code>.
    </>
  )
}

const INSIGHT_ERRORS: Record<string, string> = {
  IndexError: 'there is no item at that position',
  NameError: 'one of these names does not exist yet',
  TypeError: 'these two kinds of value do not fit together',
  ZeroDivisionError: 'it would divide by zero',
}

function describeInsight(insight: Insight, lineText: string): ComponentChildren {
  if (insight.value === null) {
    return (
      <>
        <code>{insight.source}</code> cannot be worked out: {INSIGHT_ERRORS[insight.error ?? ''] ?? insight.error}.
      </>
    )
  }
  if (insight.role !== 'condition') {
    return (
      <>
        <code>{insight.source}</code> is <code>{insight.value.text}</code>.
      </>
    )
  }
  const isTrue = insight.value.text === 'True'
  const loop = lineText.startsWith('while')
  let consequence = isTrue ? 'so the lines under it run' : 'so the lines under it are skipped'
  if (loop) consequence = isTrue ? 'so the loop runs a round' : 'so the loop ends'
  return (
    <>
      <code>{insight.source}</code> is <code>{insight.value.text}</code>, {consequence}.
    </>
  )
}

function pointersFor(listName: string, trace: TraceResult, variables: VariableView[]): Pointer[] {
  const result: Pointer[] = []
  for (const pair of trace.pairs) {
    if (pair.list !== listName) continue
    const variable = variables.find((entry) => entry.name === pair.index)
    if (variable?.value.kind === 'int') result.push({ name: pair.index, value: Number(variable.value.text) })
  }
  return result
}

export function Stepper({ title, code, trace, kind, givenText, note }: StepperProps) {
  const total = trace.steps.length
  const [index, setIndex] = useState(0)
  useEffect(() => setIndex(0), [trace])

  const lines = useMemo(() => code.split('\n'), [code])
  const position = Math.min(index, total)
  const state = trace.states[position]
  const before = position > 0 ? trace.states[position - 1] : undefined
  const executed = position > 0 ? trace.steps[position - 1] : undefined
  const upcoming = position < total ? trace.steps[position] : undefined
  const atEnd = position === total
  const variables = state?.variables ?? []
  const lists = variables.filter((entry) => entry.value.kind === 'list' && entry.value.items !== undefined)
  const others = variables.filter((entry) => !lists.includes(entry))
  const changes = before && state ? findChanges(before, state) : []
  const changedNames = new Set(changes.map((change) => change.name))
  const output = trace.stdout.slice(0, state?.outputLength ?? 0)
  const printedNow = before && state ? trace.stdout.slice(before.outputLength, state.outputLength) : ''
  const executedText = executed ? (lines[executed.line - 1] ?? '').trim() : ''
  const raisedHere = atEnd && trace.status === 'error' && trace.error !== null
  const endExplanation = atEnd ? explainStop(trace.status, trace.stopReason, trace.hardStop, 4) : null

  const go = (next: number) => setIndex(Math.max(0, Math.min(total, next)))

  if (trace.status === 'syntax-error' || trace.status === 'given-error' || !state) {
    return null
  }

  return (
    <section
      class="stepper"
      aria-label={`Step through: ${title}`}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement) return
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          go(position + 1)
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault()
          go(position - 1)
        }
      }}
    >
      <header class="stepper-head">
        <h3>{title}</h3>
        <p class="stepper-kind">
          {kind === 'prepared'
            ? 'Prepared example. Python ran this program in your browser just now, and every step below is what it recorded.'
            : 'Your code, as Python really ran it.'}
          {givenText && (
            <>
              {' '}
              Given: <code>{givenText}</code>
            </>
          )}
        </p>
        {note && (
          <p class="stepper-note">
            <InlineText text={note} />
          </p>
        )}
      </header>

      <div class="stepper-body">
        <div class="stepper-code">
          <CodeBlock code={code} numbered ranLine={executed?.line ?? null} nextLine={upcoming?.line ?? null} />
          <p class="stepper-legend">
            <span class="legend-swatch legend-swatch--ran" /> ran in this step
            <span class="legend-swatch legend-swatch--next" /> runs next
          </p>
        </div>

        <div class="stepper-state">
          {lists.map((entry) => (
            <ListStrip
              key={entry.name}
              name={entry.name}
              list={entry.value}
              before={before?.variables.find((earlier) => earlier.name === entry.name)?.value ?? null}
              pointers={pointersFor(entry.name, trace, variables)}
            />
          ))}
          {others.length > 0 && (
            <table class="value-table value-table--variables">
              <caption class="visually-hidden">Other variables</caption>
              <thead>
                <tr>
                  <th scope="col">name</th>
                  <th scope="col">value now</th>
                </tr>
              </thead>
              <tbody>
                {others.map((entry) => (
                  <tr key={entry.name} class={changedNames.has(entry.name) ? 'is-changed' : undefined}>
                    <th scope="row">
                      <code>{entry.name}</code>
                    </th>
                    <td>
                      <code>{entry.value.text}</code>
                      {changedNames.has(entry.name) && <span class="change-tag">changed in this step</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {variables.length === 0 && <p class="quiet">No variables yet.</p>}
          {output !== '' && (
            <div class="stepper-output">
              <p class="mini-label">Printed so far</p>
              <CodeBlock code={output} plain />
            </div>
          )}
        </div>
      </div>

      <div class="stepper-story" aria-live="polite">
        {!executed && <p>This is the state before the first line runs. Press Next to run line {upcoming?.line ?? 1}.</p>}
        {executed && (
          <>
            <p>
              Line {executed.line} ran: <code>{executedText}</code>
            </p>
            <ul>
              {executed.insights.map((insight) => (
                <li key={insight.source}>{describeInsight(insight, executedText)}</li>
              ))}
              {changes.map((change) => (
                <li key={change.name}>{describeChange(change)}</li>
              ))}
              {printedNow !== '' && (
                <li>
                  It printed <code>{printedNow.replace(/\n$/, '')}</code>.
                </li>
              )}
              {!raisedHere &&
                changes.length === 0 &&
                printedNow === '' &&
                !executed.insights.some((insight) => insight.role === 'condition') && <li>No variable changed and nothing was printed.</li>}
            </ul>
          </>
        )}
        {atEnd && trace.status === 'ok' && <p class="stepper-end">The program has finished.</p>}
        {raisedHere && trace.error && (
          <p class="stepper-end stepper-end--problem">
            <InlineText text={explainError(trace.error, variables, false).summary} />{' '}
            <InlineText text={explainError(trace.error, variables, false).detail} />
          </p>
        )}
        {atEnd && trace.status === 'trace-limit' && (
          <p class="stepper-end stepper-end--problem">
            The step-through records the first {total} steps and stops there. The program had not finished. If the same lines
            keep repeating with the same values, look for the variable in the loop's condition that is not changing.
          </p>
        )}
        {endExplanation && (
          <p class="stepper-end stepper-end--problem">
            <InlineText text={endExplanation.summary} />
          </p>
        )}
      </div>

      <div class="stepper-controls">
        <button type="button" class="button" onClick={() => go(position - 1)} disabled={position === 0}>
          Back
        </button>
        <button type="button" class="button button--primary" onClick={() => go(position + 1)} disabled={atEnd}>
          Next
        </button>
        <label class="stepper-slider">
          <span class="visually-hidden">Step</span>
          <input
            type="range"
            min={0}
            max={total}
            value={position}
            onInput={(event) => go(Number(event.currentTarget.value))}
            aria-valuetext={`Step ${position} of ${total}`}
          />
        </label>
        <span class="stepper-count">
          Step {position} of {total}
        </span>
        <button type="button" class="button button--quiet" onClick={() => go(0)} disabled={position === 0}>
          Start again
        </button>
      </div>
    </section>
  )
}
