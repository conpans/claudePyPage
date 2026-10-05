// What the app records about practice, and what it is willing to conclude from it.
//
// The rules here are deliberately plain, because a learner should be able to predict them:
//   - A pass means the code passed the tests that were run. It does not mean mastery.
//   - A pass is "with help" if a hint, the explanation or the worked solution was opened
//     during that attempt, or if the learner says they had outside help.
//   - A pass is "independent" only if no in-app help was opened AND the learner says so.
//     Not clicking a hint proves nothing by itself, so without that report the status stays
//     "passed, help not reported".
//   - "Revisited successfully" needs an independent pass from a fresh start, on a later day
//     than an earlier pass.

import type { StopReason, TestStatus } from '../python/protocol.ts'

export const STATE_VERSION = 1

export interface FailureLine {
  target: string
  expected: string | null
  actual: string | null
  missing: boolean
  note: string | null
}

/** The first test that did not pass, kept so it can be shown again and copied into a help message. */
export interface TestProblem {
  name: string
  given: string
  status: TestStatus
  lines: FailureLine[]
  error: { type: string; message: string; line: number | null } | null
  output: string
  feedback: string | null
  stopReason: StopReason | null
}

export interface CheckRecord {
  at: string
  passed: boolean
  passedCount: number
  total: number
  problem: TestProblem | null
  restrictions: string[]
}

export interface PredictRecord {
  at: string
  answers: string[]
  correct: boolean[]
}

export type OutsideHelp = 'yes' | 'no'

/** Help opened inside the app during one attempt. */
export interface HelpUsed {
  /** The highest hint number opened (0 means none). */
  hints: number
  explanation: boolean
  solution: boolean
  /** Prediction items only: stepped through the program before answering correctly. */
  steppedThrough: boolean
}

/** One attempt: from a start (or a fresh start) up to a pass, or up to the next fresh start. */
export interface Attempt {
  startedAt: string
  /** True for the first attempt and for every attempt begun with "Start a fresh attempt". */
  fresh: boolean
  runs: number
  checks: number
  help: HelpUsed
  prerequisitesVisited: string[]
  contextCopied: boolean
  /** The learner's own answer to "did you have outside help?". Null until they answer. */
  outsideHelp: OutsideHelp | null
  passedAt: string | null
  /** The help that had been opened at the moment of the pass. Later peeking does not change it. */
  helpAtPass: HelpUsed | null
  /** The code that passed (or the code left behind when a fresh attempt was started). */
  finalCode: string | null
  lastCheck: CheckRecord | null
  lastPredict: PredictRecord | null
}

export interface ItemProgress {
  attempts: Attempt[]
  lastWorkedAt: string
}

export interface SkillProgress {
  confusing: boolean
  markedAt: string | null
}

export interface Draft {
  code: string
  /** The learner's own "given" values for Run, as Python source. Null means the example values. */
  given: string | null
  /** Answers typed into a prediction item. */
  answers: string[] | null
  updatedAt: string
}

export type ThemeChoice = 'system' | 'light' | 'dark'

export interface Session {
  lastItemId: string | null
  /** "I went to practice `to` while working on `from`": lets the app offer the way back. */
  returnTo: { from: string; to: string }[]
  theme: ThemeChoice
}

export interface AppState {
  version: typeof STATE_VERSION
  items: Record<string, ItemProgress>
  skills: Record<string, SkillProgress>
  drafts: Record<string, Draft>
  session: Session
}

export function emptyState(): AppState {
  return {
    version: STATE_VERSION,
    items: {},
    skills: {},
    drafts: {},
    session: { lastItemId: null, returnTo: [], theme: 'system' },
  }
}

export const NO_HELP: HelpUsed = { hints: 0, explanation: false, solution: false, steppedThrough: false }

export function newAttempt(now: string, fresh: boolean): Attempt {
  return {
    startedAt: now,
    fresh,
    runs: 0,
    checks: 0,
    help: { ...NO_HELP },
    prerequisitesVisited: [],
    contextCopied: false,
    outsideHelp: null,
    passedAt: null,
    helpAtPass: null,
    finalCode: null,
    lastCheck: null,
    lastPredict: null,
  }
}

export function usedHelp(help: HelpUsed): boolean {
  return help.hints > 0 || help.explanation || help.solution || help.steppedThrough
}

export type AttemptOutcome = 'in-progress' | 'passed-with-help' | 'passed-unreported' | 'passed-independent'

export function attemptOutcome(attempt: Attempt): AttemptOutcome {
  if (attempt.passedAt === null) return 'in-progress'
  if (usedHelp(attempt.helpAtPass ?? attempt.help) || attempt.outsideHelp === 'yes') return 'passed-with-help'
  if (attempt.outsideHelp === 'no') return 'passed-independent'
  return 'passed-unreported'
}

export type ItemStatus =
  | 'not-started'
  | 'attempted'
  | 'passed-with-help'
  | 'passed-unreported'
  | 'passed-independent'
  | 'revisited'

export const STATUS_LABELS: Record<ItemStatus, string> = {
  'not-started': 'Not started',
  attempted: 'Attempted',
  'passed-with-help': 'Passed with help',
  'passed-unreported': 'Passed, help not reported',
  'passed-independent': 'Passed, reported independent',
  revisited: 'Revisited successfully',
}

/** What each status means, in the words shown to the learner. */
export const STATUS_MEANINGS: Record<ItemStatus, string> = {
  'not-started': 'Nothing has been run or checked here yet.',
  attempted: 'You have run or checked code here, and it has not passed yet.',
  'passed-with-help':
    'Your code passed its tests in an attempt where a hint, the explanation or the worked solution was opened, or where you reported outside help.',
  'passed-unreported':
    'Your code passed its tests and no in-app help was opened. You have not said yet whether you had help from outside the app.',
  'passed-independent': 'Your code passed its tests, no in-app help was opened, and you reported that you had no outside help.',
  revisited:
    'You passed again from a blank start on a later day, without in-app help, and reported no outside help.',
}

/** The calendar day of a timestamp in the learner's own time zone, as YYYY-MM-DD. */
export function localDay(timestamp: string): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function hasActivity(attempt: Attempt): boolean {
  return attempt.runs > 0 || attempt.checks > 0 || attempt.lastPredict !== null || usedHelp(attempt.help)
}

export function itemStatus(progress: ItemProgress | undefined): ItemStatus {
  if (!progress || !progress.attempts.some(hasActivity)) return 'not-started'
  const attempts = progress.attempts
  const outcomes = attempts.map(attemptOutcome)

  for (let index = 1; index < attempts.length; index += 1) {
    const attempt = attempts[index]
    if (!attempt || outcomes[index] !== 'passed-independent' || !attempt.fresh || attempt.passedAt === null) continue
    const day = localDay(attempt.passedAt)
    const passedEarlier = attempts
      .slice(0, index)
      .some((earlier) => earlier.passedAt !== null && localDay(earlier.passedAt) < day)
    if (passedEarlier) return 'revisited'
  }
  if (outcomes.includes('passed-independent')) return 'passed-independent'
  if (outcomes.includes('passed-unreported')) return 'passed-unreported'
  if (outcomes.includes('passed-with-help')) return 'passed-with-help'
  return 'attempted'
}

export function currentAttempt(progress: ItemProgress | undefined): Attempt | undefined {
  return progress?.attempts.at(-1)
}

export function hasPassed(progress: ItemProgress | undefined): boolean {
  return progress?.attempts.some((attempt) => attempt.passedAt !== null) ?? false
}

/** The latest pass, if any. */
export function lastPass(progress: ItemProgress | undefined): Attempt | undefined {
  return progress?.attempts.findLast((attempt) => attempt.passedAt !== null)
}

/**
 * True when the worked solution was revealed and there has been no pass from a fresh start
 * since. This is the evidence behind the "try it again from a blank start" suggestion.
 */
export function retryAfterSolution(progress: ItemProgress | undefined): boolean {
  if (!progress) return false
  const revealedAt = progress.attempts.findLastIndex((attempt) => attempt.help.solution)
  if (revealedAt === -1) return false
  return !progress.attempts
    .slice(revealedAt + 1)
    .some((attempt) => attempt.fresh && attempt.passedAt !== null && !usedHelp(attempt.helpAtPass ?? attempt.help))
}

/** Whether the current attempt is unfinished work the learner could pick up again. */
export function isUnfinished(progress: ItemProgress | undefined): boolean {
  const attempt = currentAttempt(progress)
  return attempt !== undefined && attempt.passedAt === null && hasActivity(attempt)
}
