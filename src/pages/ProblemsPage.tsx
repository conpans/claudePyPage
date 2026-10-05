// "Browse problems": every item in the collection, with filters.

import { useState } from 'preact/hooks'
import { content } from '../content/index.ts'
import { DIFFICULTY_LABELS, FORMAT_LABELS, TIER_LABELS, type Item } from '../content/schema.ts'
import { href } from '../router.ts'
import { useAppState } from '../state/hooks.ts'
import { itemStatus, STATUS_LABELS, type ItemStatus } from '../state/progress.ts'
import { StatusBadge } from '../ui/common.tsx'
import { InlineText } from '../ui/Markdown.tsx'

type KindFilter = 'problems' | 'exercise' | 'all'
type SourceFilter = 'any' | 'original' | 'leetcode-adaptation'
type ProgressFilter = 'any' | 'open' | ItemStatus

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'problems', label: 'Challenges and follow-ups' },
  { value: 'exercise', label: 'Skill exercises' },
  { value: 'all', label: 'Everything' },
]

function matchesProgress(status: ItemStatus, filter: ProgressFilter): boolean {
  if (filter === 'any') return true
  if (filter === 'open') return status === 'not-started' || status === 'attempted'
  return status === filter
}

export function ProblemsPage() {
  const state = useAppState()
  const [kind, setKind] = useState<KindFilter>('problems')
  const [skill, setSkill] = useState('any')
  const [source, setSource] = useState<SourceFilter>('any')
  const [difficulty, setDifficulty] = useState('any')
  const [progress, setProgress] = useState<ProgressFilter>('any')

  const visible = content.items.filter((item: Item) => {
    if (kind === 'problems' && item.tier === 'exercise') return false
    if (kind === 'exercise' && item.tier !== 'exercise') return false
    if (skill !== 'any' && !item.skills.includes(skill)) return false
    if (source !== 'any' && item.source.type !== source) return false
    if (difficulty !== 'any' && String(item.difficulty) !== difficulty) return false
    return matchesProgress(itemStatus(state.items[item.id]), progress)
  })

  const filtered = skill !== 'any' || source !== 'any' || difficulty !== 'any' || progress !== 'any' || kind !== 'problems'
  const reset = () => {
    setKind('problems')
    setSkill('any')
    setSource('any')
    setDifficulty('any')
    setProgress('any')
  }

  return (
    <div class="page">
      <h1>Browse problems</h1>
      <p class="lead">
        Start with any problem that looks interesting. Each one lists the skills it uses and has warm-ups for the pieces it
        needs, so you can step back and return without losing your code.
      </p>

      <form class="filters" aria-label="Filters" onSubmit={(event) => event.preventDefault()}>
        <label class="field">
          <span class="field-label">Show</span>
          <select class="field-input" value={kind} onChange={(event) => setKind(event.currentTarget.value as KindFilter)}>
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label class="field">
          <span class="field-label">Skill</span>
          <select class="field-input" value={skill} onChange={(event) => setSkill(event.currentTarget.value)}>
            <option value="any">Any skill</option>
            {content.skills.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.shortTitle}
              </option>
            ))}
          </select>
        </label>
        <label class="field">
          <span class="field-label">Source</span>
          <select class="field-input" value={source} onChange={(event) => setSource(event.currentTarget.value as SourceFilter)}>
            <option value="any">Any source</option>
            <option value="original">Original</option>
            <option value="leetcode-adaptation">Adapted from LeetCode</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">Difficulty</span>
          <select class="field-input" value={difficulty} onChange={(event) => setDifficulty(event.currentTarget.value)}>
            <option value="any">Any</option>
            <option value="1">{DIFFICULTY_LABELS[1]}</option>
            <option value="2">{DIFFICULTY_LABELS[2]}</option>
            <option value="3">{DIFFICULTY_LABELS[3]}</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">Your progress</span>
          <select class="field-input" value={progress} onChange={(event) => setProgress(event.currentTarget.value as ProgressFilter)}>
            <option value="any">Any</option>
            <option value="open">Not passed yet</option>
            {(Object.keys(STATUS_LABELS) as ItemStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        {filtered && (
          <button type="button" class="button button--quiet" onClick={reset}>
            Clear filters
          </button>
        )}
      </form>

      <p class="quiet" role="status">
        Showing {visible.length} of {content.items.length}. Difficulty compares items within this collection only.
      </p>

      {visible.length === 0 ? (
        <p class="notice">
          Nothing matches these filters.{' '}
          <button type="button" class="link-button" onClick={reset}>
            Clear the filters
          </button>
        </p>
      ) : (
        <div class="table-scroll">
          <table class="problem-table">
            <thead>
              <tr>
                <th scope="col">Problem</th>
                <th scope="col">Kind</th>
                <th scope="col">Skills it uses</th>
                <th scope="col">Source</th>
                <th scope="col">Difficulty</th>
                <th scope="col">Your progress</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    <a href={href.practice(item.id)}>{item.title}</a>
                    <span class="row-goal">
                      <InlineText text={item.goal} />
                    </span>
                  </th>
                  <td>
                    {TIER_LABELS[item.tier]}
                    <span class="row-goal">{FORMAT_LABELS[item.format]}</span>
                  </td>
                  <td>
                    <span class="chips">
                      {content.skillsOf(item).map((entry) => (
                        <a key={entry.id} class="chip" href={href.skill(entry.id)}>
                          {entry.shortTitle}
                        </a>
                      ))}
                    </span>
                  </td>
                  <td>
                    {item.source.type === 'leetcode-adaptation' ? (
                      <>
                        Adapted from{' '}
                        <a href={item.source.url} target="_blank" rel="noopener noreferrer">
                          LeetCode {item.source.number}
                        </a>
                      </>
                    ) : (
                      'Original'
                    )}
                  </td>
                  <td>{DIFFICULTY_LABELS[item.difficulty]}</td>
                  <td>
                    <StatusBadge status={itemStatus(state.items[item.id])} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
