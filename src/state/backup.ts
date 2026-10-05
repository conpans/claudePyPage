// The backup file format, and the checks a file must pass before it may replace anything.
//
// A backup is plain JSON:
//   { "format": "stepwise-backup", "version": 1, "exportedAt": "...", "state": { ... } }
// The same reader checks what is loaded from browser storage, so a damaged store is caught
// the same way as a damaged file. Reading never changes anything; it returns either a
// complete, checked state or a list of problems.

import type { TestStatus } from '../python/protocol.ts'
import {
  STATE_VERSION,
  type AppState,
  type Attempt,
  type CheckRecord,
  type Draft,
  type HelpUsed,
  type ItemProgress,
  type PredictRecord,
  type Session,
  type SkillProgress,
  type TestProblem,
} from './progress.ts'

export const BACKUP_FORMAT = 'stepwise-backup'
export const MAX_BACKUP_BYTES = 5_000_000
const MAX_TEXT = 200_000

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  app: string
  state: AppState
}

export type ReadResult = { ok: true; state: AppState } | { ok: false; errors: string[] }

const TEST_STATUSES: readonly TestStatus[] = ['pass', 'fail', 'error', 'syntax-error', 'given-error', 'stopped', 'output-limit']

class Problems {
  readonly list: string[] = []
  add(path: string, message: string): void {
    if (this.list.length < 20) this.list.push(`${path}: ${message}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, path: string, problems: Problems, max = MAX_TEXT): string {
  if (typeof value !== 'string') {
    problems.add(path, 'should be text')
    return ''
  }
  if (value.length > max) {
    problems.add(path, 'is longer than this app accepts')
    return ''
  }
  return value
}

function optionalText(value: unknown, path: string, problems: Problems): string | null {
  return value === null || value === undefined ? null : text(value, path, problems)
}

function timestamp(value: unknown, path: string, problems: Problems): string {
  const result = text(value, path, problems, 40)
  if (result && Number.isNaN(Date.parse(result))) problems.add(path, 'should be a date and time')
  return result
}

function optionalTimestamp(value: unknown, path: string, problems: Problems): string | null {
  return value === null || value === undefined ? null : timestamp(value, path, problems)
}

function flag(value: unknown, path: string, problems: Problems): boolean {
  if (typeof value !== 'boolean') {
    problems.add(path, 'should be true or false')
    return false
  }
  return value
}

function count(value: unknown, path: string, problems: Problems): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1_000_000) {
    problems.add(path, 'should be a whole number of zero or more')
    return 0
  }
  return value
}

function optionalNumber(value: unknown, path: string, problems: Problems): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    problems.add(path, 'should be a number')
    return null
  }
  return value
}

function list<T>(value: unknown, path: string, problems: Problems, read: (entry: unknown, path: string) => T, max = 2000): T[] {
  if (!Array.isArray(value)) {
    problems.add(path, 'should be a list')
    return []
  }
  if (value.length > max) {
    problems.add(path, 'has more entries than this app accepts')
    return []
  }
  return value.map((entry, index) => read(entry, `${path}[${index}]`))
}

function record(value: unknown, path: string, problems: Problems): Record<string, unknown> {
  if (!isRecord(value)) {
    problems.add(path, 'should be a group of named values')
    return {}
  }
  return value
}

function readHelp(value: unknown, path: string, problems: Problems): HelpUsed {
  const source = record(value, path, problems)
  return {
    hints: count(source.hints, `${path}.hints`, problems),
    explanation: flag(source.explanation, `${path}.explanation`, problems),
    solution: flag(source.solution, `${path}.solution`, problems),
    steppedThrough: flag(source.steppedThrough, `${path}.steppedThrough`, problems),
  }
}

function readProblem(value: unknown, path: string, problems: Problems): TestProblem {
  const source = record(value, path, problems)
  const status = TEST_STATUSES.find((entry) => entry === source.status)
  if (status === undefined) problems.add(`${path}.status`, 'is not a known test result')
  const errorSource = source.error === null || source.error === undefined ? null : record(source.error, `${path}.error`, problems)
  const stopReason = source.stopReason === 'time-limit' || source.stopReason === 'user' ? source.stopReason : null
  return {
    name: text(source.name, `${path}.name`, problems),
    given: text(source.given, `${path}.given`, problems),
    status: status ?? 'fail',
    lines: list(source.lines, `${path}.lines`, problems, (entry, entryPath) => {
      const line = record(entry, entryPath, problems)
      return {
        target: text(line.target, `${entryPath}.target`, problems),
        expected: optionalText(line.expected, `${entryPath}.expected`, problems),
        actual: optionalText(line.actual, `${entryPath}.actual`, problems),
        missing: flag(line.missing, `${entryPath}.missing`, problems),
        note: optionalText(line.note, `${entryPath}.note`, problems),
      }
    }),
    error: errorSource
      ? {
          type: text(errorSource.type, `${path}.error.type`, problems),
          message: text(errorSource.message, `${path}.error.message`, problems),
          line: optionalNumber(errorSource.line, `${path}.error.line`, problems),
        }
      : null,
    output: text(source.output, `${path}.output`, problems),
    feedback: optionalText(source.feedback, `${path}.feedback`, problems),
    stopReason,
  }
}

function readCheck(value: unknown, path: string, problems: Problems): CheckRecord {
  const source = record(value, path, problems)
  return {
    at: timestamp(source.at, `${path}.at`, problems),
    passed: flag(source.passed, `${path}.passed`, problems),
    passedCount: count(source.passedCount, `${path}.passedCount`, problems),
    total: count(source.total, `${path}.total`, problems),
    problem: source.problem === null || source.problem === undefined ? null : readProblem(source.problem, `${path}.problem`, problems),
    restrictions: list(source.restrictions, `${path}.restrictions`, problems, (entry, entryPath) => text(entry, entryPath, problems)),
  }
}

function readPredict(value: unknown, path: string, problems: Problems): PredictRecord {
  const source = record(value, path, problems)
  return {
    at: timestamp(source.at, `${path}.at`, problems),
    answers: list(source.answers, `${path}.answers`, problems, (entry, entryPath) => text(entry, entryPath, problems)),
    correct: list(source.correct, `${path}.correct`, problems, (entry, entryPath) => flag(entry, entryPath, problems)),
  }
}

function readAttempt(value: unknown, path: string, problems: Problems): Attempt {
  const source = record(value, path, problems)
  const outsideHelp = source.outsideHelp === 'yes' || source.outsideHelp === 'no' ? source.outsideHelp : null
  if (source.outsideHelp !== null && source.outsideHelp !== undefined && outsideHelp === null) {
    problems.add(`${path}.outsideHelp`, 'should be "yes", "no" or empty')
  }
  return {
    startedAt: timestamp(source.startedAt, `${path}.startedAt`, problems),
    fresh: flag(source.fresh, `${path}.fresh`, problems),
    runs: count(source.runs, `${path}.runs`, problems),
    checks: count(source.checks, `${path}.checks`, problems),
    help: readHelp(source.help, `${path}.help`, problems),
    prerequisitesVisited: list(source.prerequisitesVisited, `${path}.prerequisitesVisited`, problems, (entry, entryPath) =>
      text(entry, entryPath, problems, 200),
    ),
    contextCopied: flag(source.contextCopied, `${path}.contextCopied`, problems),
    outsideHelp,
    passedAt: optionalTimestamp(source.passedAt, `${path}.passedAt`, problems),
    helpAtPass: source.helpAtPass === null || source.helpAtPass === undefined ? null : readHelp(source.helpAtPass, `${path}.helpAtPass`, problems),
    finalCode: optionalText(source.finalCode, `${path}.finalCode`, problems),
    lastCheck: source.lastCheck === null || source.lastCheck === undefined ? null : readCheck(source.lastCheck, `${path}.lastCheck`, problems),
    lastPredict:
      source.lastPredict === null || source.lastPredict === undefined ? null : readPredict(source.lastPredict, `${path}.lastPredict`, problems),
  }
}

function readItems(value: unknown, problems: Problems): Record<string, ItemProgress> {
  const result: Record<string, ItemProgress> = {}
  for (const [id, entry] of Object.entries(record(value, 'items', problems))) {
    const path = `items.${id}`
    const source = record(entry, path, problems)
    result[id] = {
      attempts: list(source.attempts, `${path}.attempts`, problems, (attempt, attemptPath) => readAttempt(attempt, attemptPath, problems), 500),
      lastWorkedAt: timestamp(source.lastWorkedAt, `${path}.lastWorkedAt`, problems),
    }
  }
  return result
}

function readSkills(value: unknown, problems: Problems): Record<string, SkillProgress> {
  const result: Record<string, SkillProgress> = {}
  for (const [id, entry] of Object.entries(record(value, 'skills', problems))) {
    const path = `skills.${id}`
    const source = record(entry, path, problems)
    result[id] = {
      confusing: flag(source.confusing, `${path}.confusing`, problems),
      markedAt: optionalTimestamp(source.markedAt, `${path}.markedAt`, problems),
    }
  }
  return result
}

function readDrafts(value: unknown, problems: Problems): Record<string, Draft> {
  const result: Record<string, Draft> = {}
  for (const [id, entry] of Object.entries(record(value, 'drafts', problems))) {
    const draft = readDraft(entry, `drafts.${id}`, problems)
    result[id] = draft
  }
  return result
}

function readDraft(value: unknown, path: string, problems: Problems): Draft {
  const source = record(value, path, problems)
  return {
    code: text(source.code, `${path}.code`, problems),
    given: optionalText(source.given, `${path}.given`, problems),
    answers:
      source.answers === null || source.answers === undefined
        ? null
        : list(source.answers, `${path}.answers`, problems, (entry, entryPath) => text(entry, entryPath, problems), 50),
    updatedAt: timestamp(source.updatedAt, `${path}.updatedAt`, problems),
  }
}

function readSession(value: unknown, problems: Problems): Session {
  const source = record(value, 'session', problems)
  const theme = source.theme === 'light' || source.theme === 'dark' || source.theme === 'system' ? source.theme : null
  if (theme === null) problems.add('session.theme', 'should be "system", "light" or "dark"')
  return {
    lastItemId: optionalText(source.lastItemId, 'session.lastItemId', problems),
    returnTo: list(
      source.returnTo,
      'session.returnTo',
      problems,
      (entry, path) => {
        const pair = record(entry, path, problems)
        return { from: text(pair.from, `${path}.from`, problems, 200), to: text(pair.to, `${path}.to`, problems, 200) }
      },
      50,
    ),
    theme: theme ?? 'system',
  }
}

/** Check a value that claims to be an app state. Nothing is trusted until every field has been read. */
export function readState(value: unknown): ReadResult {
  const problems = new Problems()
  if (!isRecord(value)) return { ok: false, errors: ['The saved data is not in the expected shape.'] }
  if (value.version !== STATE_VERSION) {
    const found = typeof value.version === 'number' ? `version ${value.version}` : 'no version number'
    return {
      ok: false,
      errors: [`This data has ${found}. This app reads version ${STATE_VERSION}. It may come from a newer version of the app.`],
    }
  }
  const state: AppState = {
    version: STATE_VERSION,
    items: readItems(value.items, problems),
    skills: readSkills(value.skills, problems),
    drafts: readDrafts(value.drafts, problems),
    session: readSession(value.session, problems),
  }
  return problems.list.length > 0 ? { ok: false, errors: problems.list } : { ok: true, state }
}

export function serializeBackup(state: AppState, exportedAt: string, app: string): string {
  const file: BackupFile = { format: BACKUP_FORMAT, version: STATE_VERSION, exportedAt, app, state }
  return JSON.stringify(file, null, 2)
}

export type ParsedBackup = { ok: true; state: AppState; exportedAt: string | null } | { ok: false; errors: string[] }

/** Read the text of a backup file. Returns the checked state, or the reasons it was refused. */
export function parseBackup(fileText: string): ParsedBackup {
  if (fileText.length > MAX_BACKUP_BYTES) {
    return { ok: false, errors: ['This file is larger than any backup this app would write, so it was not read.'] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(fileText)
  } catch {
    return { ok: false, errors: ['This file is not valid JSON, so it cannot be a Stepwise backup.'] }
  }
  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT) {
    return { ok: false, errors: ['This file is not a Stepwise backup (it is missing the line "format": "stepwise-backup").'] }
  }
  if (parsed.version !== STATE_VERSION) {
    const found = typeof parsed.version === 'number' ? `version ${parsed.version}` : 'no version number'
    return {
      ok: false,
      errors: [`This backup has ${found}. This app reads version ${STATE_VERSION}. It may come from a newer version of the app.`],
    }
  }
  const result = readState(parsed.state)
  if (!result.ok) return result
  return { ok: true, state: result.state, exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null }
}

export interface BackupSummary {
  itemsWithProgress: number
  passes: number
  drafts: number
  skillsMarked: number
}

export function summarize(state: AppState): BackupSummary {
  const items = Object.values(state.items)
  return {
    itemsWithProgress: items.filter((item) => item.attempts.length > 0).length,
    passes: items.filter((item) => item.attempts.some((attempt) => attempt.passedAt !== null)).length,
    drafts: Object.keys(state.drafts).length,
    skillsMarked: Object.values(state.skills).filter((skill) => skill.confusing).length,
  }
}
