// The left-hand side of an exercise: the task, and the help that can be opened step by step.
// Help stays closed until the learner asks for it, and opening it is recorded for the
// current attempt (see state/progress.ts for what that changes).

import { useState } from 'preact/hooks'
import { content } from '../content/index.ts'
import { givenSource, toPythonLiteral } from '../content/python-literal.ts'
import { isCodeItem, type CodeItem, type Item } from '../content/schema.ts'
import { href } from '../router.ts'
import { store } from '../state/hooks.ts'
import { currentAttempt, itemStatus, type AppState } from '../state/progress.ts'
import { CodeBlock } from '../ui/CodeBlock.tsx'
import { StatusBadge } from '../ui/common.tsx'
import { InlineText, Markdown } from '../ui/Markdown.tsx'

type TabId = 'task' | 'hints' | 'explanation' | 'solution'

const TABS: { id: TabId; label: string }[] = [
  { id: 'task', label: 'Task' },
  { id: 'hints', label: 'Hints' },
  { id: 'explanation', label: 'Explanation' },
  { id: 'solution', label: 'Worked solution' },
]

function Contract({ item }: { item: CodeItem }) {
  return (
    <div class="contract">
      {item.given.length > 0 && (
        <>
          <h3>Given</h3>
          <p class="quiet">These variables already exist when your code starts. The checker changes their values from test to test.</p>
          <ul class="contract-list">
            {item.given.map((spec) => (
              <li key={spec.name}>
                <code>{spec.name}</code>: <InlineText text={spec.describe} />
              </li>
            ))}
          </ul>
        </>
      )}
      {item.create.length > 0 && (
        <>
          <h3>Your code leaves the answer in</h3>
          <ul class="contract-list">
            {item.create.map((spec) => (
              <li key={spec.name}>
                <code>{spec.name}</code>: <InlineText text={spec.describe} />
              </li>
            ))}
          </ul>
        </>
      )}
      {item.prints && (
        <>
          <h3>Your code prints</h3>
          <p>
            <InlineText text={item.prints} />
          </p>
        </>
      )}
    </div>
  )
}

function Examples({ item }: { item: CodeItem }) {
  return (
    <>
      <h3>{item.examples.length === 1 ? 'Example' : 'Examples'}</h3>
      <ul class="examples">
        {item.examples.map((example, index) => {
          const results = Object.entries(example.result)
            .map(([name, value]) => `${name} = ${toPythonLiteral(value)}`)
            .join('\n')
          return (
            <li key={index}>
              {Object.keys(example.given).length > 0 && (
                <div>
                  <p class="mini-label">Given</p>
                  <CodeBlock code={givenSource(example.given)} />
                </div>
              )}
              {results !== '' && (
                <div>
                  <p class="mini-label">Result</p>
                  <CodeBlock code={results} />
                </div>
              )}
              {example.output !== null && (
                <div>
                  <p class="mini-label">Printed</p>
                  <CodeBlock code={example.output} plain />
                </div>
              )}
              {example.why && (
                <p class="example-why">
                  <InlineText text={example.why} />
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function Links({ item, state }: { item: Item; state: AppState }) {
  const warmUps = content.list(item.prerequisites)
  const related = content.list(item.related)
  const followUps = content.followUpsOf(item.id)
  const parent = item.variationOf ? content.item(item.variationOf) : undefined
  const row = (target: Item) => (
    <li key={target.id}>
      <a href={href.practice(target.id, item.id)}>{target.title}</a>
      <StatusBadge status={itemStatus(state.items[target.id])} />
    </li>
  )
  return (
    <div class="links">
      <h3>Skills this uses</h3>
      <ul class="link-list link-list--inline">
        {content.skillsOf(item).map((skill) => (
          <li key={skill.id}>
            <a class="chip" href={href.skill(skill.id)}>
              {skill.shortTitle}
            </a>
          </li>
        ))}
      </ul>
      {warmUps.length > 0 && (
        <>
          <h3>Warm-ups</h3>
          <p class="quiet">Smaller exercises for the pieces this one needs. Your code here stays saved while you are away.</p>
          <ul class="link-list">{warmUps.map(row)}</ul>
        </>
      )}
      {parent && (
        <>
          <h3>Follows on from</h3>
          <ul class="link-list">{row(parent)}</ul>
        </>
      )}
      {followUps.length > 0 && (
        <>
          <h3>Follow-ups</h3>
          <ul class="link-list">{followUps.map(row)}</ul>
        </>
      )}
      {related.length > 0 && (
        <>
          <h3>Related</h3>
          <ul class="link-list">{related.map(row)}</ul>
        </>
      )}
    </div>
  )
}

function SourceNote({ item }: { item: Item }) {
  if (item.source.type !== 'leetcode-adaptation') {
    return <p class="source-note">An original exercise, written for this app.</p>
  }
  return (
    <div class="source-note">
      <p>
        A practice adaptation of LeetCode problem {item.source.number},{' '}
        <a href={item.source.url} target="_blank" rel="noopener noreferrer">
          {item.source.title}
        </a>{' '}
        (opens leetcode.com in a new tab). The text here was written for this app. It is not LeetCode's own.
      </p>
      {item.source.interfaceNote && <Markdown source={item.source.interfaceNote} />}
    </div>
  )
}

interface TaskPanelProps {
  item: Item
  state: AppState
  /** Called when the learner asks to begin again from the starter code. */
  onFreshAttempt: () => void
}

export function TaskPanel({ item, state, onFreshAttempt }: TaskPanelProps) {
  const [tab, setTab] = useState<TabId>('task')
  const [confirmingSolution, setConfirmingSolution] = useState(false)
  const attempt = currentAttempt(state.items[item.id])
  const hintsOpened = attempt?.help.hints ?? 0
  const explanationOpened = attempt?.help.explanation ?? false
  const solutionOpened = attempt?.help.solution ?? false
  const passed = attempt?.passedAt != null
  const nextItem = item.next ? content.item(item.next) : undefined

  const selectTab = (id: TabId) => {
    setTab(id)
    setConfirmingSolution(false)
  }

  return (
    <div class="task-panel">
      <div class="tabs" role="tablist" aria-label="Task and help">
        {TABS.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls={`panel-${entry.id}`}
            tabIndex={tab === entry.id ? 0 : -1}
            class="tab"
            onClick={() => selectTab(entry.id)}
            onKeyDown={(event) => {
              const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
              if (step === 0) return
              event.preventDefault()
              const next = TABS[(index + step + TABS.length) % TABS.length]
              if (!next) return
              selectTab(next.id)
              document.getElementById(`tab-${next.id}`)?.focus()
            }}
          >
            {entry.label}
            {entry.id === 'hints' && hintsOpened > 0 && <span class="tab-count">{hintsOpened}</span>}
          </button>
        ))}
      </div>

      <div class="tab-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
        {tab === 'task' && (
          <>
            <p class="goal">
              <InlineText text={item.goal} />
            </p>
            <Markdown source={item.statement} />
            {isCodeItem(item) && <Contract item={item} />}
            {item.rules.length > 0 && (
              <>
                <h3>Rules</h3>
                <ul class="rules">
                  {item.rules.map((rule) => (
                    <li key={rule}>
                      <InlineText text={rule} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h3>What you write</h3>
            <p>
              <InlineText text={item.toWrite} />
            </p>
            {isCodeItem(item) && <Examples item={item} />}
            {item.newIdea && (
              <>
                <h3>The one new idea</h3>
                <p>
                  <InlineText text={item.newIdea} />
                </p>
              </>
            )}
            <Links item={item} state={state} />
            <SourceNote item={item} />
          </>
        )}

        {tab === 'hints' && (
          <>
            <p class="quiet">
              Hints go from a nudge to nearly there. Opening one is recorded for this attempt, which then counts as passed
              with help.
            </p>
            <ol class="hints">
              {item.hints.slice(0, hintsOpened).map((hint, index) => (
                <li key={index}>
                  <Markdown source={hint} />
                </li>
              ))}
            </ol>
            {hintsOpened < item.hints.length ? (
              <button type="button" class="button" onClick={() => store.openHint(item.id, hintsOpened + 1)}>
                Show hint {hintsOpened + 1} of {item.hints.length}
              </button>
            ) : (
              <p class="quiet">Those are all the hints. The explanation goes further, and the worked solution shows the whole thing.</p>
            )}
          </>
        )}

        {tab === 'explanation' && (
          <>
            {explanationOpened || passed ? (
              <Markdown source={item.explanation} />
            ) : (
              <>
                <p>The explanation walks through the idea with concrete values. It does not contain the finished code.</p>
                <p class="quiet">Opening it is recorded for this attempt, which then counts as passed with help.</p>
                <button type="button" class="button" onClick={() => store.openExplanation(item.id)}>
                  Show the explanation
                </button>
              </>
            )}
          </>
        )}

        {tab === 'solution' && (
          <>
            {solutionOpened || passed ? (
              <>
                {isCodeItem(item) && <CodeBlock code={item.solution.code} numbered label="Worked solution" />}
                <Markdown source={item.solution.walkthrough} />
                {isCodeItem(item) && <p class="quiet">This is one correct program. The checker accepts any program that gives the right results.</p>}
                <div class="after-solution">
                  <h3>Make it yours</h3>
                  <p>Reading a solution and writing one are different skills. Two ways to find out whether this one has settled:</p>
                  <ul class="link-list">
                    <li>
                      <button type="button" class="button" onClick={onFreshAttempt}>
                        Start a fresh attempt
                      </button>
                      <span class="quiet">Clears the editor back to the starter. Your earlier code is kept under Progress.</span>
                    </li>
                    {nextItem && (
                      <li>
                        <a href={href.practice(nextItem.id, item.id)}>Try {nextItem.title} next</a>
                        <span class="quiet">A different task, so you have not seen its answer.</span>
                      </li>
                    )}
                  </ul>
                </div>
              </>
            ) : confirmingSolution ? (
              <>
                <p>
                  The worked solution shows a complete program and explains each line. Once it is open, this attempt is
                  recorded as "solution opened", and the app will suggest a fresh attempt later.
                </p>
                <div class="button-row">
                  <button
                    type="button"
                    class="button button--primary"
                    onClick={() => {
                      store.revealSolution(item.id)
                      setConfirmingSolution(false)
                    }}
                  >
                    Show the worked solution
                  </button>
                  <button type="button" class="button" onClick={() => setConfirmingSolution(false)}>
                    Not yet
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>The worked solution is hidden until you ask for it.</p>
                <p class="quiet">
                  If you are stuck, the hints and the explanation give less away. If you have given it a fair try and want to
                  see how it is done, that is a good reason to open it.
                </p>
                <button type="button" class="button" onClick={() => setConfirmingSolution(true)}>
                  I want to see the worked solution
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
