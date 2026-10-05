// The app's saved state: progress, drafts and a little session memory.
//
// Everything is kept in the browser's localStorage for this address. Progress and drafts are
// written within a moment of every change, so a reload or a closed tab loses nothing.
// Drafts are stored under their own keys so that typing rewrites one small entry, not the
// whole state.

import { readState } from './backup.ts'
import {
  STATE_VERSION,
  emptyState,
  newAttempt,
  usedHelp,
  type AppState,
  type Attempt,
  type CheckRecord,
  type Draft,
  type ItemProgress,
  type OutsideHelp,
  type PredictRecord,
  type ThemeChoice,
} from './progress.ts'

/** The part of the browser's storage the store needs. Tests supply an in-memory one. */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  keys(): string[]
}

export const STATE_KEY = 'stepwise.v1.state'
export const DRAFT_PREFIX = 'stepwise.v1.draft.'
export const UNDO_KEY = 'stepwise.v1.before-import'
export const UNREADABLE_PREFIX = 'stepwise.v1.unreadable.'

export function browserStorage(): KeyValueStorage {
  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
    keys: () => Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? ''),
  }
}

type Listener = () => void

export class AppStore {
  private state: AppState
  private readonly listeners = new Set<Listener>()
  private readonly storage: KeyValueStorage
  private readonly now: () => string
  /** Set when saving failed (for example, storage is full), so the page can say so. */
  saveError: string | null = null
  /** Set when stored data could not be read at start. The raw data was kept aside, not deleted. */
  loadWarning: string | null = null

  constructor(storage: KeyValueStorage, now: () => string = () => new Date().toISOString()) {
    this.storage = storage
    this.now = now
    this.state = this.load()
  }

  getState(): AppState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Read again from storage (another tab may have changed it). */
  reload(): void {
    this.state = this.load()
    this.notify()
  }

  // --- reading and writing ---------------------------------------------------------------

  private load(): AppState {
    const state = emptyState()
    const raw = this.storage.getItem(STATE_KEY)
    if (raw !== null) {
      let parsed: unknown = null
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = null
      }
      const result = readState({ ...(typeof parsed === 'object' && parsed !== null ? parsed : {}), drafts: {} })
      if (result.ok) {
        state.items = result.state.items
        state.skills = result.state.skills
        state.session = result.state.session
      } else {
        // Never throw unreadable data away: keep it under another key and say what happened.
        this.storage.setItem(`${UNREADABLE_PREFIX}${this.now()}`, raw)
        this.loadWarning =
          'The saved progress in this browser could not be read, so the app started empty. The unreadable data was kept; a backup file can be imported under Progress and backup.'
      }
    }
    for (const key of this.storage.keys()) {
      if (!key.startsWith(DRAFT_PREFIX)) continue
      const draft = this.readDraft(this.storage.getItem(key))
      if (draft) state.drafts[key.slice(DRAFT_PREFIX.length)] = draft
    }
    return state
  }

  private readDraft(raw: string | null): Draft | null {
    if (raw === null) return null
    try {
      const result = readState({ version: STATE_VERSION, items: {}, skills: {}, session: emptyState().session, drafts: { draft: JSON.parse(raw) } })
      return result.ok ? (result.state.drafts.draft ?? null) : null
    } catch {
      return null
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage.setItem(key, value)
      this.saveError = null
    } catch (error) {
      this.saveError = `The browser refused to save (${error instanceof Error ? error.message : String(error)}). Export a backup from Progress and backup to keep your work.`
    }
  }

  private saveProgress(): void {
    const { version, items, skills, session } = this.state
    this.write(STATE_KEY, JSON.stringify({ version, items, skills, session }))
  }

  private saveDraft(id: string): void {
    const draft = this.state.drafts[id]
    if (draft) this.write(DRAFT_PREFIX + id, JSON.stringify(draft))
    else this.storage.removeItem(DRAFT_PREFIX + id)
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  private commit(next: AppState, draftId?: string): void {
    const progressChanged = next.items !== this.state.items || next.skills !== this.state.skills || next.session !== this.state.session
    this.state = next
    if (progressChanged) this.saveProgress()
    if (draftId !== undefined) this.saveDraft(draftId)
    this.notify()
  }

  // --- helpers ------------------------------------------------------------------------------

  /** Change the current attempt of an item, creating the item record and attempt when needed. */
  private updateAttempt(id: string, change: (attempt: Attempt) => Attempt): AppState {
    const now = this.now()
    const existing = this.state.items[id]
    const attempts = existing ? [...existing.attempts] : []
    const current = attempts.pop() ?? newAttempt(now, true)
    attempts.push(change(current))
    const progress: ItemProgress = { attempts, lastWorkedAt: now }
    return {
      ...this.state,
      items: { ...this.state.items, [id]: progress },
      session: { ...this.state.session, lastItemId: id },
    }
  }

  // --- actions ------------------------------------------------------------------------------

  /** The learner opened an item, possibly by following a warm-up link from another item. */
  visit(id: string, from: string | null): void {
    let next: AppState = { ...this.state, session: { ...this.state.session, lastItemId: id } }
    if (from !== null && from !== id) {
      const already = next.session.returnTo.some((entry) => entry.from === from && entry.to === id)
      if (!already) {
        next = { ...next, session: { ...next.session, returnTo: [...next.session.returnTo, { from, to: id }] } }
      }
      const origin = next.items[from]
      const attempt = origin?.attempts.at(-1)
      if (origin && attempt && !attempt.prerequisitesVisited.includes(id)) {
        const updated = { ...attempt, prerequisitesVisited: [...attempt.prerequisitesVisited, id] }
        next = {
          ...next,
          items: { ...next.items, [from]: { ...origin, attempts: [...origin.attempts.slice(0, -1), updated] } },
        }
      }
    }
    this.commit(next)
  }

  /** The learner went back to the item they came from, or dismissed the way back. */
  clearReturn(to: string): void {
    const returnTo = this.state.session.returnTo.filter((entry) => entry.to !== to)
    if (returnTo.length !== this.state.session.returnTo.length) {
      this.commit({ ...this.state, session: { ...this.state.session, returnTo } })
    }
  }

  setDraft(id: string, change: Partial<Pick<Draft, 'code' | 'given' | 'answers'>>, starter: string): void {
    const existing = this.state.drafts[id] ?? { code: starter, given: null, answers: null, updatedAt: this.now() }
    const draft: Draft = { ...existing, ...change, updatedAt: this.now() }
    this.commit({ ...this.state, drafts: { ...this.state.drafts, [id]: draft } }, id)
  }

  recordRun(id: string): void {
    this.commit(this.updateAttempt(id, (attempt) => ({ ...attempt, runs: attempt.runs + 1 })))
  }

  recordCheck(id: string, record: CheckRecord, code: string): void {
    this.commit(
      this.updateAttempt(id, (attempt) => {
        const next = { ...attempt, checks: attempt.checks + 1, lastCheck: record }
        if (record.passed && attempt.passedAt === null) {
          return { ...next, passedAt: record.at, helpAtPass: { ...attempt.help }, finalCode: code }
        }
        return next
      }),
    )
  }

  recordPredict(id: string, record: PredictRecord): void {
    this.commit(
      this.updateAttempt(id, (attempt) => {
        const next = { ...attempt, checks: attempt.checks + 1, lastPredict: record }
        const allCorrect = record.correct.length > 0 && record.correct.every(Boolean)
        if (allCorrect && attempt.passedAt === null) {
          return { ...next, passedAt: record.at, helpAtPass: { ...attempt.help } }
        }
        return next
      }),
    )
  }

  openHint(id: string, hintNumber: number): void {
    this.commit(
      this.updateAttempt(id, (attempt) => ({
        ...attempt,
        help: { ...attempt.help, hints: Math.max(attempt.help.hints, hintNumber) },
      })),
    )
  }

  openExplanation(id: string): void {
    this.commit(this.updateAttempt(id, (attempt) => ({ ...attempt, help: { ...attempt.help, explanation: true } })))
  }

  revealSolution(id: string): void {
    this.commit(this.updateAttempt(id, (attempt) => ({ ...attempt, help: { ...attempt.help, solution: true } })))
  }

  recordStepThrough(id: string): void {
    this.commit(this.updateAttempt(id, (attempt) => ({ ...attempt, help: { ...attempt.help, steppedThrough: true } })))
  }

  recordContextCopied(id: string): void {
    this.commit(this.updateAttempt(id, (attempt) => ({ ...attempt, contextCopied: true })))
  }

  /** The learner's own answer to "did you have help from outside the app?". */
  reportOutsideHelp(id: string, answer: OutsideHelp | null): void {
    this.commit(this.updateAttempt(id, (attempt) => ({ ...attempt, outsideHelp: answer })))
  }

  /** Begin again from the starter code. The old attempt, and the code it ended with, are kept. */
  startFreshAttempt(id: string, starter: string): void {
    const now = this.now()
    const existing = this.state.items[id]
    const attempts = existing ? [...existing.attempts] : []
    const last = attempts.pop()
    if (last) {
      const leftBehind = this.state.drafts[id]?.code ?? null
      attempts.push({ ...last, finalCode: last.finalCode ?? leftBehind })
    }
    attempts.push(newAttempt(now, true))
    const draft: Draft = { code: starter, given: null, answers: null, updatedAt: now }
    this.commit(
      {
        ...this.state,
        items: { ...this.state.items, [id]: { attempts, lastWorkedAt: now } },
        drafts: { ...this.state.drafts, [id]: draft },
        session: { ...this.state.session, lastItemId: id },
      },
      id,
    )
  }

  setSkillConfusing(skillId: string, confusing: boolean): void {
    this.commit({
      ...this.state,
      skills: { ...this.state.skills, [skillId]: { confusing, markedAt: confusing ? this.now() : null } },
    })
  }

  setTheme(theme: ThemeChoice): void {
    this.commit({ ...this.state, session: { ...this.state.session, theme } })
  }

  // --- backup ---------------------------------------------------------------------------------

  /** Replace everything with a checked state from a backup. The previous state is kept for one undo. */
  replaceAll(next: AppState): void {
    this.write(UNDO_KEY, JSON.stringify(this.state))
    for (const id of Object.keys(this.state.drafts)) this.storage.removeItem(DRAFT_PREFIX + id)
    this.state = { ...next, session: { ...next.session, theme: this.state.session.theme } }
    this.saveProgress()
    for (const id of Object.keys(this.state.drafts)) this.saveDraft(id)
    this.notify()
  }

  get canUndoImport(): boolean {
    return this.storage.getItem(UNDO_KEY) !== null
  }

  /** Put back the state from before the last import. Returns false if it could not be read. */
  undoImport(): boolean {
    const raw = this.storage.getItem(UNDO_KEY)
    if (raw === null) return false
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return false
    }
    const result = readState(parsed)
    if (!result.ok) return false
    for (const id of Object.keys(this.state.drafts)) this.storage.removeItem(DRAFT_PREFIX + id)
    this.state = result.state
    this.saveProgress()
    for (const id of Object.keys(this.state.drafts)) this.saveDraft(id)
    this.storage.removeItem(UNDO_KEY)
    this.notify()
    return true
  }
}

/** Whether the pass of this attempt can be reported as independent at all. */
export function canReportIndependent(attempt: Attempt): boolean {
  return !usedHelp(attempt.helpAtPass ?? attempt.help)
}
