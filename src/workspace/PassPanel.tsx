// Shown after a pass: what the pass does and does not show, the learner's own report about
// help, and a small number of sensible next steps.

import { content } from '../content/index.ts'
import type { Item } from '../content/schema.ts'
import { href } from '../router.ts'
import { store } from '../state/hooks.ts'
import { attemptOutcome, hasPassed, type AppState, type Attempt } from '../state/progress.ts'
import { canReportIndependent } from '../state/store.ts'
import { InlineText } from '../ui/Markdown.tsx'

interface PassPanelProps {
  item: Item
  attempt: Attempt
  state: AppState
  onFreshAttempt: () => void
}

function nextSteps(item: Item, state: AppState): { target: Item; why: string }[] {
  const open = (candidate: Item) => !hasPassed(state.items[candidate.id])
  const steps: { target: Item; why: string }[] = []
  const add = (target: Item | undefined, why: string) => {
    if (target && open(target) && !steps.some((entry) => entry.target.id === target.id)) steps.push({ target, why })
  }
  for (const origin of state.session.returnTo.filter((entry) => entry.to === item.id)) {
    const from = content.item(origin.from)
    if (from && !steps.some((entry) => entry.target.id === from.id)) {
      steps.push({ target: from, why: 'You came here from this one. Your code there is saved.' })
    }
  }
  if (item.tier === 'exercise' && item.skill) {
    const unit = content.exercisesOf(item.skill)
    add(unit.slice(unit.findIndex((entry) => entry.id === item.id) + 1).find(open), 'The next exercise in this unit.')
  }
  for (const followUp of content.followUpsOf(item.id)) {
    add(followUp, followUp.newIdea ? `A follow-up. ${followUp.newIdea}` : 'A follow-up to this challenge.')
  }
  for (const builds of content.buildsOn(item.id)) {
    add(builds, builds.newIdea ? `Builds on this one. ${builds.newIdea}` : 'Builds on this one.')
  }
  return steps.slice(0, 3)
}

export function PassPanel({ item, attempt, state, onFreshAttempt }: PassPanelProps) {
  const independentPossible = canReportIndependent(attempt)
  const outcome = attemptOutcome(attempt)
  const steps = nextSteps(item, state)
  return (
    <section class="pass" aria-label="After the pass">
      <h3>That works</h3>
      <p>
        {item.format === 'predict'
          ? 'Your predictions match what Python really does with this program.'
          : 'Your code gave the right result for every test. That shows it is correct for the cases that were tried.'}
      </p>

      {independentPossible ? (
        <fieldset class="report">
          <legend>Did you have help from outside the app for this attempt?</legend>
          <p class="quiet">Notes, a search, a person or an AI all count. The app cannot know, so it records what you say.</p>
          <label class="choice">
            <input
              type="radio"
              name={`help-${item.id}`}
              checked={attempt.outsideHelp === 'no'}
              onChange={() => store.reportOutsideHelp(item.id, 'no')}
            />
            No, I did this on my own
          </label>
          <label class="choice">
            <input
              type="radio"
              name={`help-${item.id}`}
              checked={attempt.outsideHelp === 'yes'}
              onChange={() => store.reportOutsideHelp(item.id, 'yes')}
            />
            Yes, I had some help
          </label>
        </fieldset>
      ) : (
        <p class="notice">
          A hint, the explanation, the worked solution or a step-through was opened during this attempt, so it is recorded as
          passed with help. That is a normal step. A fresh attempt on a later day can show the same thing done alone.
        </p>
      )}
      <p class="recorded" role="status">
        Recorded as:{' '}
        <strong>
          {outcome === 'passed-independent'
            ? 'passed, reported independent'
            : outcome === 'passed-with-help'
              ? 'passed with help'
              : 'passed, help not reported yet'}
        </strong>
      </p>

      {steps.length > 0 && (
        <>
          <h3>Where next</h3>
          <ul class="link-list">
            {steps.map(({ target, why }) => (
              <li key={target.id}>
                <a href={href.practice(target.id)}>{target.title}</a>
                <span class="quiet">
                  <InlineText text={why} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p class="quiet">
        To test whether it has stayed, come back on another day and{' '}
        <button type="button" class="link-button" onClick={onFreshAttempt}>
          start a fresh attempt
        </button>
        .
      </p>
    </section>
  )
}
