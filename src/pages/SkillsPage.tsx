// "Practice a skill": the six units, and a table showing which problems use which skills.

import { content } from '../content/index.ts'
import { href } from '../router.ts'
import { store, useAppState } from '../state/hooks.ts'
import { itemStatus } from '../state/progress.ts'
import { StatusBadge, StatusDots } from '../ui/common.tsx'

export function SkillsPage() {
  const state = useAppState()
  const problems = content.problems

  return (
    <div class="page">
      <h1>Practice a skill</h1>
      <p class="lead">
        Each unit explains one skill with examples you can step through, then gives a few short exercises. The same skills
        come back in the problems, so a unit is also the place to go when a problem shows a gap.
      </p>

      <ol class="skill-list">
        {content.skills.map((skill) => {
          const exercises = content.exercisesOf(skill.id)
          const statuses = exercises.map((item) => itemStatus(state.items[item.id]))
          const passed = statuses.filter((status) => status !== 'not-started' && status !== 'attempted').length
          const confusing = state.skills[skill.id]?.confusing ?? false
          return (
            <li key={skill.id} class="skill-card">
              <h2>
                <a href={href.skill(skill.id)}>{skill.title}</a>
              </h2>
              <p>{skill.summary}</p>
              <p class="skill-facts">
                <StatusDots statuses={statuses} label={`${passed} of ${exercises.length} exercises passed`} />
                <span>
                  {passed} of {exercises.length} exercises passed
                </span>
                <span>
                  Used by {content.problemsUsing(skill.id).length}{' '}
                  {content.problemsUsing(skill.id).length === 1 ? 'problem' : 'problems'}
                </span>
              </p>
              <label class="choice">
                <input
                  type="checkbox"
                  checked={confusing}
                  onChange={(event) => store.setSkillConfusing(skill.id, event.currentTarget.checked)}
                />
                This one confuses me. Suggest practice for it.
              </label>
            </li>
          )
        })}
      </ol>

      <section aria-labelledby="map-title">
        <h2 id="map-title">Which problems use which skills</h2>
        <p class="quiet">
          A filled square means the problem uses that skill. Read across a row to see what a problem needs. Read down a
          column to find problems that practice one skill.
        </p>
        <div class="table-scroll">
          <table class="skill-map">
            <thead>
              <tr>
                <th scope="col">Problem</th>
                {content.skills.map((skill) => (
                  <th key={skill.id} scope="col">
                    <a href={href.skill(skill.id)}>{skill.shortTitle}</a>
                  </th>
                ))}
                <th scope="col">Your progress</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((item) => (
                <tr key={item.id} class={item.tier === 'variation' ? 'is-follow-up' : undefined}>
                  <th scope="row">
                    <a href={href.practice(item.id)}>{item.title}</a>
                    {item.tier === 'variation' && <span class="quiet-tag">follow-up</span>}
                  </th>
                  {content.skills.map((skill) => {
                    const uses = item.skills.includes(skill.id)
                    return (
                      <td key={skill.id} class={uses ? 'uses' : undefined}>
                        {uses ? (
                          <>
                            <span class="uses-mark" aria-hidden="true" />
                            <span class="visually-hidden">uses {skill.shortTitle}</span>
                          </>
                        ) : (
                          <span class="visually-hidden">no</span>
                        )}
                      </td>
                    )
                  })}
                  <td>
                    <StatusBadge status={itemStatus(state.items[item.id])} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
