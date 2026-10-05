// Shows what happened when code was run or checked.

import type { ComponentChildren } from 'preact'
import type { CodeItem } from '../content/schema.ts'
import type { CheckResult, ErrorInfo, RunResult, RunStatus, StopReason, TestOutcome, VariableView } from '../python/protocol.ts'
import { DEFAULT_LIMITS } from '../python/runtime.ts'
import { CodeBlock } from '../ui/CodeBlock.tsx'
import { InlineText } from '../ui/Markdown.tsx'
import { explainError, explainStop } from './explain.ts'
import { feedbackFor, firstProblem, restrictionMessages } from './records.ts'

type RanTest = Extract<TestOutcome, { ran: true }>

function Variables({ variables, item, heading }: { variables: VariableView[]; item: CodeItem; heading: string }) {
  const resultNames = item.create.map((spec) => spec.name)
  const missing = resultNames.filter((name) => !variables.some((entry) => entry.name === name))
  if (variables.length === 0 && missing.length === 0) return null
  const ordered = [...variables].sort((a, b) => Number(resultNames.includes(b.name)) - Number(resultNames.includes(a.name)))
  return (
    <div class="result-block">
      <p class="mini-label">{heading}</p>
      <table class="value-table value-table--variables">
        <tbody>
          {missing.map((name) => (
            <tr key={name} class="is-missing">
              <th scope="row">
                <code>{name}</code>
              </th>
              <td>
                not created yet <span class="change-tag">the checker reads this</span>
              </td>
            </tr>
          ))}
          {ordered.map((entry) => (
            <tr key={entry.name}>
              <th scope="row">
                <code>{entry.name}</code>
              </th>
              <td>
                <code>{entry.value.text}</code>
                {resultNames.includes(entry.name) && <span class="change-tag">the checker reads this</span>}
                {entry.given && !resultNames.includes(entry.name) && <span class="quiet-tag">given</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Output({ text, truncated }: { text: string; truncated: boolean }) {
  if (text === '') return null
  return (
    <div class="result-block">
      <p class="mini-label">Printed output{truncated ? ' (cut off at the limit)' : ''}</p>
      <CodeBlock code={text} plain label="Printed output" />
    </div>
  )
}

interface Ending {
  status: RunStatus | 'pass' | 'fail'
  error: ErrorInfo | null
  stopLine: number | null
  stopReason?: StopReason
  hardStop?: boolean
  variables: VariableView[]
}

/** The explanation for a run that did not reach its end. */
function Trouble({ ending, seconds }: { ending: Ending; seconds: number }) {
  const { status, error, variables } = ending
  let body: ComponentChildren = null
  if ((status === 'error' || status === 'syntax-error' || status === 'given-error') && error) {
    const explanation =
      status === 'given-error'
        ? { summary: 'The given values could not be read as Python.', detail: 'Check the box of given values above the editor for a missing bracket or quotation mark.' }
        : explainError(error, variables, status === 'syntax-error')
    body = (
      <>
        <p class="trouble-summary">
          <InlineText text={explanation.summary} />
        </p>
        {explanation.detail && (
          <p>
            <InlineText text={explanation.detail} />
          </p>
        )}
        {error.lineText && status !== 'given-error' && (
          <p>
            Line {error.line}: <code>{error.lineText}</code>
          </p>
        )}
        <p class="quiet">
          Python's own message: <code>{`${error.type}: ${error.message}`}</code>
        </p>
      </>
    )
  } else {
    const explanation = explainStop(status, ending.stopReason, ending.hardStop, seconds)
    if (!explanation) return null
    body = (
      <>
        <p class="trouble-summary">
          <InlineText text={explanation.summary} />
        </p>
        <p>
          <InlineText text={explanation.detail} />
        </p>
        {ending.stopLine !== null && <p>It was on line {ending.stopLine} when it stopped.</p>}
      </>
    )
  }
  return (
    <div class="trouble" role="alert">
      {body}
    </div>
  )
}

export function RunView({ result, item }: { result: RunResult; item: CodeItem }) {
  const finished = result.status === 'ok'
  return (
    <div class="results">
      <h3 class="results-title">{finished ? 'The program ran to the end' : 'The program did not finish'}</h3>
      <Trouble ending={result} seconds={DEFAULT_LIMITS.runMs / 1000} />
      <Output text={result.stdout} truncated={result.outputTruncated} />
      {finished && result.stdout === '' && item.prints && <p class="quiet">Nothing was printed.</p>}
      {result.status === 'stopped' && result.variables.length === 0 ? (
        <p class="quiet">The variables could not be read this time. Step through shows them line by line.</p>
      ) : (
        result.status !== 'syntax-error' &&
        result.status !== 'given-error' && (
          <Variables
            variables={result.variables}
            item={item}
            heading={finished ? 'Variables after the program ended' : 'Variables at the moment it stopped'}
          />
        )
      )}
      {finished && <p class="quiet">Run only tries the given values shown above the editor. Check tests your code with several sets of values.</p>}
    </div>
  )
}

const TEST_MARKS: Record<string, { mark: string; word: string }> = {
  pass: { mark: '✓', word: 'passed' },
  fail: { mark: '✗', word: 'wrong result' },
  error: { mark: '✗', word: 'error' },
  'syntax-error': { mark: '✗', word: 'could not be read' },
  'given-error': { mark: '✗', word: 'problem with the given values' },
  stopped: { mark: '■', word: 'stopped' },
  'output-limit': { mark: '■', word: 'stopped' },
  'not-run': { mark: '–', word: 'not run' },
}

function TestDetails({
  test,
  item,
  unchangedStarter,
  onStepThrough,
}: {
  test: RanTest
  item: CodeItem
  unchangedStarter: boolean
  onStepThrough: (given: string, name: string) => void
}) {
  const feedback = feedbackFor(item, test, unchangedStarter)
  const failing = test.checks.filter((line) => !line.ok)
  const canStep = test.status !== 'syntax-error' && test.status !== 'given-error'
  return (
    <div class="test-details">
      {test.given.trim() !== '' && (
        <div class="result-block">
          <p class="mini-label">This test gave your code</p>
          <CodeBlock code={test.given} />
        </div>
      )}
      <Trouble ending={test} seconds={DEFAULT_LIMITS.testMs / 1000} />
      {failing.map((line) => (
        <div key={`${line.kind}-${line.target}`} class="compare">
          {line.kind === 'variable' || line.kind === 'stdout' ? (
            <dl class="compare-pair">
              <div>
                <dt>Expected {line.kind === 'stdout' ? 'output' : <code>{line.target}</code>}</dt>
                <dd>{line.kind === 'stdout' ? <CodeBlock code={line.expected ?? ''} plain /> : <code>{line.expected}</code>}</dd>
              </div>
              <div>
                <dt>Your {line.kind === 'stdout' ? 'output' : <code>{line.target}</code>}</dt>
                <dd>
                  {line.missing ? (
                    <span>
                      Your code did not create a variable with this name.
                      {line.similar.length > 0 && (
                        <>
                          {' '}
                          It did create <code>{line.similar.join(', ')}</code>. Check the spelling.
                        </>
                      )}
                    </span>
                  ) : line.kind === 'stdout' ? (
                    line.actual ? (
                      <CodeBlock code={line.actual} plain />
                    ) : (
                      <span>(nothing was printed)</span>
                    )
                  ) : (
                    <code>{line.actual}</code>
                  )}
                </dd>
              </div>
            </dl>
          ) : null}
          {line.note && (
            <p class="compare-note">
              <InlineText text={line.note} />
            </p>
          )}
        </div>
      ))}
      {feedback && (
        <div class="feedback">
          <p class="mini-label">What this result usually means</p>
          <p>
            <InlineText text={feedback.feedback} />
          </p>
        </div>
      )}
      {unchangedStarter && item.format !== 'fix' && (
        <p class="quiet">This is still the starter code. Write your part, then check again.</p>
      )}
      <Output text={test.stdout} truncated={test.outputTruncated} />
      {(test.status === 'error' || test.status === 'stopped' || test.status === 'output-limit') && (
        <Variables variables={test.variables} item={item} heading="Variables at the moment it stopped" />
      )}
      {canStep && (
        <button type="button" class="button" onClick={() => onStepThrough(test.given, test.name)}>
          Step through this test
        </button>
      )}
    </div>
  )
}

interface CheckViewProps {
  result: CheckResult
  item: CodeItem
  unchangedStarter: boolean
  onStepThrough: (given: string, name: string) => void
}

export function CheckView({ result, item, unchangedStarter, onStepThrough }: CheckViewProps) {
  const total = result.tests.length
  const passedCount = result.tests.filter((test) => test.ran && test.status === 'pass').length
  const restrictions = restrictionMessages(result)
  const problem = firstProblem(result)
  const allTestsPassed = passedCount === total
  return (
    <div class="results">
      <h3 class={`results-title${result.passed ? ' results-title--good' : ''}`}>
        {result.passed
          ? `All ${total} tests passed`
          : allTestsPassed
            ? `All ${total} tests passed, but one of the rules was not followed`
            : `${passedCount} of ${total} tests passed`}
      </h3>
      {restrictions.map((message) => (
        <div key={message} class="trouble" role="alert">
          <p class="trouble-summary">
            <InlineText text={message} />
          </p>
          <p>Your result is right. The rule is there so that you practice the part this exercise is about.</p>
        </div>
      ))}
      {!result.passed &&
        result.inspection.hardCoded.map((hit) => (
          <p key={hit.name} class="notice">
            Line {hit.line} gives <code>{hit.name}</code> a fixed value. The checker supplies its own <code>{hit.name}</code> for
            every test, and that line replaces it, so your code always works on the same values. Remove that line.
          </p>
        ))}
      <ul class="tests">
        {result.tests.map((test) => {
          const key = test.ran ? test.status : 'not-run'
          const mark = TEST_MARKS[key] ?? { mark: '✗', word: key }
          const open = test === problem
          return (
            <li key={test.name} class={`test test--${key}`}>
              <details open={open}>
                <summary>
                  <span class="test-mark" aria-hidden="true">
                    {mark.mark}
                  </span>
                  <span class="test-name">{test.name}</span>
                  <span class="test-word">{mark.word}</span>
                </summary>
                <p class="test-purpose">
                  <InlineText text={test.purpose} />
                </p>
                {test.ran && test.status !== 'pass' && (
                  <TestDetails test={test} item={item} unchangedStarter={unchangedStarter} onStepThrough={onStepThrough} />
                )}
                {test.ran && test.status === 'pass' && test.given.trim() !== '' && <CodeBlock code={test.given} />}
                {!test.ran && <p class="quiet">Not run, because an earlier test already showed a problem that affects every test.</p>}
              </details>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
