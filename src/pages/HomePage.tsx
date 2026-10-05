// "Continue": pick up unfinished work, or take one of a few suggestions, each with its reason.

import { content } from '../content/index.ts'
import { href } from '../router.ts'
import { useAppState } from '../state/hooks.ts'
import { itemStatus } from '../state/progress.ts'
import { recommend } from '../state/recommend.ts'
import { StatusBadge, StatusDots } from '../ui/common.tsx'

export function HomePage() {
  const state = useAppState()
  const { resume, suggestions } = recommend(content, state, new Date())
  const resumeItem = resume ? content.item(resume.itemId) : undefined

  return (
    <div class="page">
      <h1>Continue</h1>

      {resume && resumeItem ? (
        <section class="resume" aria-label="Unfinished work">
          <p class="resume-label">Where you stopped</p>
          <h2>{resumeItem.title}</h2>
          <p>{resume.reason}</p>
          <a class="button button--primary" href={href.practice(resumeItem.id)}>
            {resume.action}
          </a>
        </section>
      ) : (
        <p class="lead">Nothing is half-finished. Take a suggestion below, or choose a skill or a problem yourself.</p>
      )}

      {suggestions.length > 0 && (
        <section aria-labelledby="suggested">
          <h2 id="suggested">Suggested next</h2>
          <ul class="suggestions">
            {suggestions.map((suggestion) => (
              <li key={`${suggestion.rule}-${suggestion.itemId}`}>
                <a class="suggestion-action" href={href.practice(suggestion.itemId)}>
                  {suggestion.action}
                </a>
                <p class="suggestion-reason">
                  <span class="why">Why:</span> {suggestion.reason}
                </p>
              </li>
            ))}
          </ul>
          <p class="quiet">
            These come from a few plain rules over what you have done here. They are suggestions, not a required order.{' '}
            <a href={href.about()}>How they are chosen</a>
          </p>
        </section>
      )}

      <div class="starts">
        <section aria-labelledby="start-skills">
          <h2 id="start-skills">Practice a skill</h2>
          <p class="quiet">A short explanation you can step through, then a few targeted exercises.</p>
          <ul class="skill-rows">
            {content.skills.map((skill) => {
              const exercises = content.exercisesOf(skill.id)
              const statuses = exercises.map((item) => itemStatus(state.items[item.id]))
              const passed = statuses.filter((status) => status !== 'not-started' && status !== 'attempted').length
              return (
                <li key={skill.id}>
                  <a href={href.skill(skill.id)}>{skill.title}</a>
                  <StatusDots statuses={statuses} label={`${passed} of ${exercises.length} exercises passed`} />
                </li>
              )
            })}
          </ul>
        </section>

        <section aria-labelledby="start-problems">
          <h2 id="start-problems">Browse problems</h2>
          <p class="quiet">Challenges that combine several skills. Try one, and step back to a warm-up if a piece is missing.</p>
          <ul class="skill-rows">
            {content.challenges.map((item) => (
              <li key={item.id}>
                <a href={href.practice(item.id)}>{item.title}</a>
                <StatusBadge status={itemStatus(state.items[item.id])} />
              </li>
            ))}
          </ul>
          <p>
            <a href={href.problems()}>See all problems, with filters</a>
          </p>
        </section>
      </div>
    </div>
  )
}
