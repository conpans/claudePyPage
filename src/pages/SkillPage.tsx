// One skill unit: the explanation in small sections (each with a step-through example where
// it helps), the unit's exercises, and the problems that use this skill.

import { content } from '../content/index.ts'
import { FORMAT_LABELS } from '../content/schema.ts'
import { href } from '../router.ts'
import { store, useAppState } from '../state/hooks.ts'
import { itemStatus } from '../state/progress.ts'
import { StatusBadge } from '../ui/common.tsx'
import { DemoStepper } from '../ui/DemoStepper.tsx'
import { InlineText, Markdown } from '../ui/Markdown.tsx'
import { NotFoundPage } from './NotFoundPage.tsx'

export function SkillPage({ id }: { id: string }) {
  const state = useAppState()
  const skill = content.skill(id)
  if (!skill) return <NotFoundPage what="skill" />
  const exercises = content.exercisesOf(skill.id)
  const problems = content.problemsUsing(skill.id)
  const confusing = state.skills[skill.id]?.confusing ?? false
  const firstOpen = exercises.find((item) => {
    const status = itemStatus(state.items[item.id])
    return status === 'not-started' || status === 'attempted'
  })

  return (
    <div class="page">
      <nav class="crumbs" aria-label="Where this is">
        <a href={href.skills()}>Skills</a>
      </nav>
      <h1>{skill.title}</h1>
      <p class="lead">{skill.summary}</p>

      <div class="unit-start">
        {firstOpen ? (
          <a class="button button--primary" href={href.practice(firstOpen.id)}>
            Go to the exercises: {firstOpen.title}
          </a>
        ) : (
          <a class="button" href="#unit-exercises" onClick={(event) => {
            event.preventDefault()
            document.getElementById('unit-exercises')?.scrollIntoView()
          }}>
            See the exercises
          </a>
        )}
        <label class="choice">
          <input
            type="checkbox"
            checked={confusing}
            onChange={(event) => store.setSkillConfusing(skill.id, event.currentTarget.checked)}
          />
          This one confuses me. Suggest practice for it.
        </label>
      </div>

      <section class="mixups" aria-labelledby="mixups-title">
        <h2 id="mixups-title">The mix-ups this unit is about</h2>
        <ul>
          {skill.mixups.map((mixup) => (
            <li key={mixup}>
              <InlineText text={mixup} />
            </li>
          ))}
        </ul>
      </section>

      {skill.sections.map((section) => (
        <section key={section.title} class="unit-section">
          <h2>{section.title}</h2>
          <Markdown source={section.body} />
          {section.demo && <DemoStepper demo={section.demo} />}
        </section>
      ))}

      <div class="unit-practice" id="unit-exercises">
        <section aria-labelledby="unit-exercises-title">
          <h2 id="unit-exercises-title">Exercises</h2>
          <ol class="exercise-list">
            {exercises.map((item) => (
              <li key={item.id}>
                <a href={href.practice(item.id)}>{item.title}</a>
                <span class="quiet">{FORMAT_LABELS[item.format]}</span>
                <StatusBadge status={itemStatus(state.items[item.id])} />
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="unit-problems-title">
          <h2 id="unit-problems-title">Problems that use this skill</h2>
          {problems.length === 0 ? (
            <p class="quiet">No problems use this skill yet.</p>
          ) : (
            <ul class="exercise-list">
              {problems.map((item) => (
                <li key={item.id}>
                  <a href={href.practice(item.id)}>{item.title}</a>
                  <span class="quiet">{item.tier === 'variation' ? 'Follow-up' : 'Challenge'}</span>
                  <StatusBadge status={itemStatus(state.items[item.id])} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
