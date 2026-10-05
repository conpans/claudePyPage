// Suggestions for what to do next. Each one comes from a plain rule over recorded evidence,
// and carries the reason in words, so the learner can see why it was suggested and ignore it
// freely. Nothing here estimates understanding.
//
// Rules, in the order they are considered:
//   resume           unfinished work in the most recently touched item
//   retry            the worked solution was revealed and there has been no fresh pass since
//   confusing-skill  a skill the learner marked as confusing
//   next-step        something that builds on the most recent pass
//   revisit          a pass with help (or an older pass) that could be confirmed from a fresh start
//   start            nothing recorded yet

import type { Content } from '../content/collection.ts'
import type { Item } from '../content/schema.ts'
import {
  currentAttempt,
  hasPassed,
  isUnfinished,
  itemStatus,
  lastPass,
  localDay,
  retryAfterSolution,
  type AppState,
  type ItemStatus,
} from './progress.ts'

export type SuggestionRule = 'resume' | 'retry' | 'confusing-skill' | 'next-step' | 'revisit' | 'start'

export interface Suggestion {
  rule: SuggestionRule
  itemId: string
  /** What the learner would do, as a short phrase. */
  action: string
  /** The evidence behind the suggestion, in a sentence or two. */
  reason: string
}

export const MAX_SUGGESTIONS = 3
const REVISIT_AFTER_HELP_DAYS = 2
const REVISIT_AFTER_PASS_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(earlier: string, now: Date): number {
  const start = new Date(`${localDay(earlier)}T00:00:00`)
  const end = new Date(`${localDay(now.toISOString())}T00:00:00`)
  return Math.round((end.getTime() - start.getTime()) / DAY_MS)
}

/** "today", "yesterday", "3 days ago", or a date for anything older than a week. */
export function when(timestamp: string, now: Date): string {
  const days = daysBetween(timestamp, now)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return `on ${new Date(timestamp).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`
}

const NOT_YET_INDEPENDENT: readonly ItemStatus[] = ['not-started', 'attempted', 'passed-with-help', 'passed-unreported']

function draftDiffers(item: Item, state: AppState): boolean {
  const draft = state.drafts[item.id]
  if (!draft) return false
  if (item.format === 'predict') return (draft.answers ?? []).some((answer) => answer.trim() !== '')
  return draft.code.trim() !== item.starter.trim()
}

function lastTouched(item: Item, state: AppState): string {
  const worked = state.items[item.id]?.lastWorkedAt ?? ''
  const drafted = state.drafts[item.id]?.updatedAt ?? ''
  return worked > drafted ? worked : drafted
}

function resumeSuggestion(content: Content, state: AppState, now: Date): Suggestion | null {
  const candidates = content.items.filter((item) => {
    const progress = state.items[item.id]
    const attempt = currentAttempt(progress)
    if (attempt?.passedAt) return false
    return isUnfinished(progress) || draftDiffers(item, state)
  })
  const item = candidates.sort((a, b) => lastTouched(b, state).localeCompare(lastTouched(a, state)))[0]
  if (!item) return null
  const attempt = currentAttempt(state.items[item.id])
  const check = attempt?.lastCheck
  const predict = attempt?.lastPredict
  let evidence = 'Your code is saved, and it has not been checked yet.'
  if (check) {
    evidence = `Your last check passed ${check.passedCount} of ${check.total} tests.`
  } else if (predict) {
    const right = predict.correct.filter(Boolean).length
    evidence = `Your last answers had ${right} of ${predict.correct.length} right.`
  } else if (item.format === 'predict') {
    evidence = 'Your answers so far are saved.'
  }
  return {
    rule: 'resume',
    itemId: item.id,
    action: `Continue ${item.title}`,
    reason: `You worked on this ${when(lastTouched(item, state), now)}. ${evidence}`,
  }
}

function retrySuggestions(content: Content, state: AppState, now: Date): Suggestion[] {
  const result: Suggestion[] = []
  const items = content.items
    .filter((item) => retryAfterSolution(state.items[item.id]))
    .sort((a, b) => lastTouched(b, state).localeCompare(lastTouched(a, state)))
  for (const item of items) {
    const revealed = state.items[item.id]?.attempts.findLast((attempt) => attempt.help.solution)
    const seen = revealed ? when(revealed.passedAt ?? revealed.startedAt, now) : 'earlier'
    result.push({
      rule: 'retry',
      itemId: item.id,
      action: `Try ${item.title} again from a blank start`,
      reason: `You opened the worked solution here ${seen}. A fresh attempt shows whether the idea has settled.`,
    })
    const other = item.next ? content.item(item.next) : undefined
    if (other && !hasPassed(state.items[other.id])) {
      result.push({
        rule: 'retry',
        itemId: other.id,
        action: `Try ${other.title} next`,
        reason: `You opened the worked solution for ${item.title}. This is a different task that builds on it, so you can try it without having seen its answer.`,
      })
    }
  }
  return result
}

function confusingSkillSuggestions(content: Content, state: AppState): Suggestion[] {
  const marked = content.skills
    .filter((skill) => state.skills[skill.id]?.confusing)
    .sort((a, b) => (state.skills[b.id]?.markedAt ?? '').localeCompare(state.skills[a.id]?.markedAt ?? ''))
  const result: Suggestion[] = []
  for (const skill of marked) {
    const exercise = content.exercisesOf(skill.id).find((item) => NOT_YET_INDEPENDENT.includes(itemStatus(state.items[item.id])))
    if (exercise) {
      result.push({
        rule: 'confusing-skill',
        itemId: exercise.id,
        action: `Practice ${exercise.title}`,
        reason: `You marked ${skill.shortTitle} as confusing. This is the next exercise in that unit you have not yet passed on your own.`,
      })
    }
  }
  return result
}

function nextStepSuggestions(content: Content, state: AppState, now: Date): Suggestion[] {
  const passed = content.items
    .flatMap((item) => {
      const pass = lastPass(state.items[item.id])
      return pass?.passedAt ? [{ item, at: pass.passedAt }] : []
    })
    .sort((a, b) => b.at.localeCompare(a.at))
  const latest = passed[0]
  if (!latest) return []
  const { item, at } = latest
  const open = (candidate: Item | undefined): candidate is Item => candidate !== undefined && !hasPassed(state.items[candidate.id])
  const result: Suggestion[] = []
  const add = (candidate: Item, how: string) => {
    if (result.some((entry) => entry.itemId === candidate.id)) return
    const idea = candidate.newIdea ? ` It adds one idea: ${lowerFirst(candidate.newIdea)}` : ''
    result.push({
      rule: 'next-step',
      itemId: candidate.id,
      action: `Try ${candidate.title}`,
      reason: `You passed ${item.title} ${when(at, now)}. ${how}${idea}`,
    })
  }

  if (item.tier === 'exercise' && item.skill) {
    const unit = content.exercisesOf(item.skill)
    const following = unit.slice(unit.indexOf(item) + 1).find(open)
    const skill = content.skill(item.skill)
    if (following) add(following, `This is the next exercise in ${skill?.shortTitle ?? 'the same unit'}.`)
  }
  for (const followUp of content.followUpsOf(item.id).filter(open)) add(followUp, 'This is a follow-up to it.')
  for (const builds of content.buildsOn(item.id).filter(open)) add(builds, 'This builds on it.')
  // At most two, so that a revisit or a fresh start can still be suggested alongside them.
  return result.slice(0, 2)
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

function revisitSuggestions(content: Content, state: AppState, now: Date): Suggestion[] {
  const result: Suggestion[] = []
  for (const item of content.items) {
    const progress = state.items[item.id]
    const pass = lastPass(progress)
    if (!pass?.passedAt) continue
    const status = itemStatus(progress)
    const age = daysBetween(pass.passedAt, now)
    if ((status === 'passed-with-help' || status === 'passed-unreported') && age >= REVISIT_AFTER_HELP_DAYS) {
      const how = status === 'passed-with-help' ? 'with help' : 'without saying whether you had help'
      result.push({
        rule: 'revisit',
        itemId: item.id,
        action: `Revisit ${item.title} from a blank start`,
        reason: `You passed this ${how} ${when(pass.passedAt, now)}. Passing it again from a blank start, without help, is what makes it "revisited successfully".`,
      })
    } else if (status === 'passed-independent' && age >= REVISIT_AFTER_PASS_DAYS) {
      result.push({
        rule: 'revisit',
        itemId: item.id,
        action: `Revisit ${item.title} from a blank start`,
        reason: `You passed this on your own ${when(pass.passedAt, now)}. Doing it again after a gap is a fair test of whether it stayed.`,
      })
    }
  }
  return result
}

function startSuggestions(content: Content, state: AppState): Suggestion[] {
  const result: Suggestion[] = []
  const anyProgress = Object.values(state.items).some((progress) => progress.attempts.length > 0)
  const firstOpen = content.skills
    .flatMap((skill) => content.exercisesOf(skill.id))
    .find((item) => itemStatus(state.items[item.id]) === 'not-started')
  if (firstOpen) {
    const skill = firstOpen.skill ? content.skill(firstOpen.skill) : undefined
    result.push({
      rule: 'start',
      itemId: firstOpen.id,
      action: anyProgress ? `Try ${firstOpen.title}` : `Start with ${firstOpen.title}`,
      reason: anyProgress
        ? `This is the first exercise you have not started, in ${skill?.shortTitle ?? 'the skill units'}.`
        : `This is the first exercise of the first skill unit${skill ? `, ${skill.shortTitle}` : ''}. It takes a few minutes.`,
    })
  }
  if (!anyProgress) {
    const conditions = content.exercisesOf('conditions')[0]
    if (conditions) {
      result.push({
        rule: 'start',
        itemId: conditions.id,
        action: `Or begin with ${conditions.title}`,
        reason: 'If you are in Part 2 of the course (combining conditions), the Conditions unit is the closest match.',
      })
    }
  }
  return result
}

export interface Recommendations {
  /** Unfinished work to pick up, shown on its own. */
  resume: Suggestion | null
  /** Up to three other suggestions, each for a different item. */
  suggestions: Suggestion[]
}

export function recommend(content: Content, state: AppState, now: Date): Recommendations {
  const resume = resumeSuggestion(content, state, now)
  const ordered = [
    ...retrySuggestions(content, state, now),
    ...confusingSkillSuggestions(content, state),
    ...nextStepSuggestions(content, state, now),
    ...revisitSuggestions(content, state, now),
    ...startSuggestions(content, state),
  ]
  const suggestions: Suggestion[] = []
  const taken = new Set<string>(resume ? [resume.itemId] : [])
  for (const suggestion of ordered) {
    if (taken.has(suggestion.itemId)) continue
    taken.add(suggestion.itemId)
    suggestions.push(suggestion)
    if (suggestions.length === MAX_SUGGESTIONS) break
  }
  return { resume, suggestions }
}
