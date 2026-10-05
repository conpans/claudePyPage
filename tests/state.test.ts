// The rules for progress, saving, backup, suggestions and the help message.
// No browser and no Python here: these are the app's own decisions, tested as plain logic.

import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { readContent } from '../build/content-plugin.ts'
import { Content } from '../src/content/collection.ts'
import { isCodeItem, type CodeItem, type PredictItem } from '../src/content/schema.ts'
import { buildHelpContext } from '../src/help/context.ts'
import type { CheckResult, TestOutcome } from '../src/python/protocol.ts'
import { parseBackup, serializeBackup, summarize } from '../src/state/backup.ts'
import { itemStatus, retryAfterSolution, type CheckRecord } from '../src/state/progress.ts'
import { MAX_SUGGESTIONS, recommend } from '../src/state/recommend.ts'
import { AppStore, DRAFT_PREFIX, STATE_KEY, UNREADABLE_PREFIX, canReportIndependent, type KeyValueStorage } from '../src/state/store.ts'
import { feedbackFor, toCheckRecord } from '../src/workspace/records.ts'

const content = new Content(readContent(resolve(import.meta.dirname, '../content')).content)

function codeItem(id: string): CodeItem {
  const item = content.item(id)
  if (!item || !isCodeItem(item)) throw new Error(`${id} should be a coding item`)
  return item
}

function predictItem(id: string): PredictItem {
  const item = content.item(id)
  if (!item || item.format !== 'predict') throw new Error(`${id} should be a prediction item`)
  return item
}

class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>()
  failWrites = false
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('quota exceeded')
    this.data.set(key, value)
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  keys() {
    return [...this.data.keys()]
  }
}

/** A clock the test moves by hand. Starts on a Monday morning, local time. */
class Clock {
  private current = new Date(2026, 9, 5, 9, 0, 0)
  now = () => this.current.toISOString()
  date = () => new Date(this.current)
  minutes(amount: number) {
    this.current = new Date(this.current.getTime() + amount * 60_000)
  }
  days(amount: number) {
    this.current = new Date(this.current.getTime() + amount * 24 * 60 * 60_000)
  }
}

const TOTALS = 'running-totals'
const ADD_UP = 'accumulators-add-up'

let storage: MemoryStorage
let clock: Clock
let store: AppStore

function passing(at: string): CheckRecord {
  return { at, passed: true, passedCount: 6, total: 6, problem: null, restrictions: [] }
}

function failing(at: string): CheckRecord {
  return {
    at,
    passed: false,
    passedCount: 2,
    total: 6,
    problem: {
      name: 'negative items',
      given: 'numbers = [5, -2, -4]\n',
      status: 'fail',
      lines: [{ target: 'running_totals', expected: '[5, 3, -1]', actual: '[5, -2, -4]', missing: false, note: null }],
      error: null,
      output: '',
      feedback: 'Your list is a copy of `numbers`.',
      stopReason: null,
    },
    restrictions: [],
  }
}

function status(id: string) {
  return itemStatus(store.getState().items[id])
}

beforeEach(() => {
  storage = new MemoryStorage()
  clock = new Clock()
  store = new AppStore(storage, clock.now)
})

describe('statuses', () => {
  it('starts as not started, and opening an exercise does not change that', () => {
    expect(status(TOTALS)).toBe('not-started')
    store.visit(TOTALS, null)
    store.setDraft(TOTALS, { code: 'total = 0' }, '')
    expect(status(TOTALS)).toBe('not-started')
  })

  it('becomes attempted after a run or a failed check', () => {
    store.recordRun(TOTALS)
    expect(status(TOTALS)).toBe('attempted')
    store.recordCheck(TOTALS, failing(clock.now()), 'x = 1')
    expect(status(TOTALS)).toBe('attempted')
  })

  it('does not call a pass independent just because no hint was opened', () => {
    store.recordCheck(TOTALS, passing(clock.now()), 'code')
    expect(status(TOTALS)).toBe('passed-unreported')
  })

  it('records an independent pass only when the learner says so', () => {
    store.recordCheck(TOTALS, passing(clock.now()), 'code')
    store.reportOutsideHelp(TOTALS, 'no')
    expect(status(TOTALS)).toBe('passed-independent')
    store.reportOutsideHelp(TOTALS, 'yes')
    expect(status(TOTALS)).toBe('passed-with-help')
  })

  it.each([
    ['a hint', () => store.openHint(TOTALS, 1)],
    ['the explanation', () => store.openExplanation(TOTALS)],
    ['the worked solution', () => store.revealSolution(TOTALS)],
    ['a step-through of a prediction', () => store.recordStepThrough(TOTALS)],
  ])('records a pass after opening %s as passed with help, whatever is reported', (_name, open) => {
    open()
    store.recordCheck(TOTALS, passing(clock.now()), 'code')
    expect(status(TOTALS)).toBe('passed-with-help')
    const attempt = store.getState().items[TOTALS]?.attempts.at(-1)
    expect(attempt && canReportIndependent(attempt)).toBe(false)
    store.reportOutsideHelp(TOTALS, 'no')
    expect(status(TOTALS)).toBe('passed-with-help')
  })

  it('does not downgrade a pass when help is opened afterwards', () => {
    store.recordCheck(TOTALS, passing(clock.now()), 'code')
    store.reportOutsideHelp(TOTALS, 'no')
    store.revealSolution(TOTALS)
    store.openHint(TOTALS, 3)
    expect(status(TOTALS)).toBe('passed-independent')
  })

  it('needs a fresh, independent pass on a later day for "revisited successfully"', () => {
    store.openHint(TOTALS, 1)
    store.recordCheck(TOTALS, passing(clock.now()), 'first')
    expect(status(TOTALS)).toBe('passed-with-help')

    // Same day, fresh and independent: better evidence, but not yet a revisit.
    clock.minutes(30)
    store.startFreshAttempt(TOTALS, 'starter')
    store.recordCheck(TOTALS, passing(clock.now()), 'second')
    store.reportOutsideHelp(TOTALS, 'no')
    expect(status(TOTALS)).toBe('passed-independent')

    // A later day, but with a hint: still not a revisit.
    clock.days(2)
    store.startFreshAttempt(TOTALS, 'starter')
    store.openHint(TOTALS, 1)
    store.recordCheck(TOTALS, passing(clock.now()), 'third')
    expect(status(TOTALS)).toBe('passed-independent')

    // A later day, fresh, no help, reported independent.
    clock.days(1)
    store.startFreshAttempt(TOTALS, 'starter')
    store.recordCheck(TOTALS, passing(clock.now()), 'fourth')
    expect(status(TOTALS)).toBe('passed-independent')
    store.reportOutsideHelp(TOTALS, 'no')
    expect(status(TOTALS)).toBe('revisited')
  })

  it('keeps the code of each attempt when a fresh one starts', () => {
    store.setDraft(TOTALS, { code: 'half finished' }, 'starter')
    store.recordRun(TOTALS)
    store.startFreshAttempt(TOTALS, 'starter')
    const state = store.getState()
    expect(state.items[TOTALS]?.attempts).toHaveLength(2)
    expect(state.items[TOTALS]?.attempts[0]?.finalCode).toBe('half finished')
    expect(state.drafts[TOTALS]?.code).toBe('starter')
  })

  it('knows when a revealed solution has not yet been followed by a fresh pass', () => {
    store.revealSolution(TOTALS)
    store.recordCheck(TOTALS, passing(clock.now()), 'copied')
    expect(retryAfterSolution(store.getState().items[TOTALS])).toBe(true)
    store.startFreshAttempt(TOTALS, 'starter')
    expect(retryAfterSolution(store.getState().items[TOTALS])).toBe(true)
    store.recordCheck(TOTALS, passing(clock.now()), 'own')
    expect(retryAfterSolution(store.getState().items[TOTALS])).toBe(false)
  })
})

describe('saving', () => {
  it('survives a reload: drafts, progress and the last place', () => {
    store.visit(TOTALS, null)
    store.setDraft(TOTALS, { code: 'total = 0\n', given: 'numbers = [9]\n' }, '')
    store.recordCheck(TOTALS, failing(clock.now()), 'total = 0\n')
    store.openHint(TOTALS, 2)
    store.setSkillConfusing('accumulators', true)

    const reloaded = new AppStore(storage, clock.now).getState()
    expect(reloaded.drafts[TOTALS]).toMatchObject({ code: 'total = 0\n', given: 'numbers = [9]\n' })
    expect(reloaded.items[TOTALS]?.attempts[0]?.lastCheck?.passedCount).toBe(2)
    expect(reloaded.items[TOTALS]?.attempts[0]?.help.hints).toBe(2)
    expect(reloaded.skills.accumulators?.confusing).toBe(true)
    expect(reloaded.session.lastItemId).toBe(TOTALS)
  })

  it('writes each draft under its own key', () => {
    store.setDraft(TOTALS, { code: 'a' }, '')
    store.setDraft(ADD_UP, { code: 'b' }, '')
    expect(storage.getItem(DRAFT_PREFIX + TOTALS)).toContain('"code":"a"')
    expect(storage.getItem(DRAFT_PREFIX + ADD_UP)).toContain('"code":"b"')
  })

  it('keeps unreadable saved data aside instead of deleting it', () => {
    storage.setItem(STATE_KEY, '{"version":1,"items":"not a map"')
    const damaged = new AppStore(storage, clock.now)
    expect(damaged.getState().items).toEqual({})
    expect(damaged.loadWarning).toContain('could not be read')
    expect(storage.keys().some((key) => key.startsWith(UNREADABLE_PREFIX))).toBe(true)
  })

  it('reports when the browser refuses to save', () => {
    storage.failWrites = true
    store.setDraft(TOTALS, { code: 'a' }, '')
    expect(store.saveError).toContain('refused to save')
  })

  it('remembers where the learner came from, and records the warm-up on the problem', () => {
    store.recordRun(TOTALS)
    store.visit(ADD_UP, TOTALS)
    const state = store.getState()
    expect(state.session.returnTo).toEqual([{ from: TOTALS, to: ADD_UP }])
    expect(state.items[TOTALS]?.attempts[0]?.prerequisitesVisited).toEqual([ADD_UP])
    store.clearReturn(ADD_UP)
    expect(store.getState().session.returnTo).toEqual([])
  })
})

describe('backup', () => {
  function withProgress() {
    store.setDraft(TOTALS, { code: 'total = 0\n' }, '')
    store.recordCheck(TOTALS, failing(clock.now()), 'total = 0\n')
    store.recordCheck(ADD_UP, passing(clock.now()), 'done')
    store.reportOutsideHelp(ADD_UP, 'no')
    store.setSkillConfusing('accumulators', true)
  }

  it('round-trips through a file', () => {
    withProgress()
    const file = serializeBackup(store.getState(), clock.now(), 'Stepwise test')
    const parsed = parseBackup(file)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.state).toEqual(store.getState())
    expect(summarize(parsed.state)).toEqual({ itemsWithProgress: 2, passes: 1, drafts: 1, skillsMarked: 1 })

    const other = new AppStore(new MemoryStorage(), clock.now)
    other.replaceAll(parsed.state)
    expect(itemStatus(other.getState().items[ADD_UP])).toBe('passed-independent')
    expect(other.getState().drafts[TOTALS]?.code).toBe('total = 0\n')
  })

  it.each([
    ['text that is not JSON', 'this is not json', 'not valid JSON'],
    ['JSON that is not a backup', '{"hello": 1}', 'not a Stepwise backup'],
    ['a newer version', '{"format":"stepwise-backup","version":2,"state":{}}', 'version 2'],
    [
      'a backup with a damaged field',
      JSON.stringify({ format: 'stepwise-backup', version: 1, state: { version: 1, items: { x: { attempts: 'many', lastWorkedAt: 'now' } }, skills: {}, drafts: {}, session: { lastItemId: null, returnTo: [], theme: 'system' } } }),
      'items.x.attempts',
    ],
    [
      'a backup with a missing part',
      JSON.stringify({ format: 'stepwise-backup', version: 1, state: { version: 1, items: {}, skills: {} } }),
      'drafts',
    ],
  ])('refuses %s and says why', (_name, text, reason) => {
    const parsed = parseBackup(text)
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.errors.join(' ')).toContain(reason)
  })

  it('leaves good data untouched when an import is refused', () => {
    withProgress()
    const before = JSON.stringify(store.getState())
    const stored = new Map(storage.data)
    const parsed = parseBackup('{"format":"stepwise-backup","version":1,"state":{"version":1,"items":[]}}')
    expect(parsed.ok).toBe(false)
    // A refused file never reaches the store, so nothing can have changed.
    expect(JSON.stringify(store.getState())).toBe(before)
    expect(storage.data).toEqual(stored)
  })

  it('can undo an import', () => {
    withProgress()
    const mine = JSON.stringify(store.getState())
    const empty = new AppStore(new MemoryStorage(), clock.now)
    store.replaceAll(empty.getState())
    expect(store.getState().items).toEqual({})
    expect(storage.getItem(DRAFT_PREFIX + TOTALS)).toBeNull()
    expect(store.canUndoImport).toBe(true)
    expect(store.undoImport()).toBe(true)
    expect(JSON.stringify(store.getState())).toBe(mine)
    expect(new AppStore(storage, clock.now).getState().drafts[TOTALS]?.code).toBe('total = 0\n')
  })
})

describe('suggestions', () => {
  const suggest = () => recommend(content, store.getState(), clock.date())

  it('offers a place to start when nothing is recorded', () => {
    const { resume, suggestions } = suggest()
    expect(resume).toBeNull()
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.length).toBeLessThanOrEqual(MAX_SUGGESTIONS)
    expect(suggestions[0]?.rule).toBe('start')
    expect(suggestions.every((suggestion) => suggestion.reason.length > 20)).toBe(true)
  })

  it('resumes unfinished work, with the evidence in the reason', () => {
    store.setDraft(TOTALS, { code: 'total = 0\n' }, '')
    store.recordCheck(TOTALS, failing(clock.now()), 'total = 0\n')
    clock.days(1)
    const { resume, suggestions } = suggest()
    expect(resume).toMatchObject({ rule: 'resume', itemId: TOTALS })
    expect(resume?.reason).toBe('You worked on this yesterday. Your last check passed 2 of 6 tests.')
    expect(suggestions.some((suggestion) => suggestion.itemId === TOTALS)).toBe(false)
  })

  it('resumes a draft that has never been run', () => {
    store.setDraft(ADD_UP, { code: 'total = 99\n' }, codeItem(ADD_UP).starter)
    expect(suggest().resume).toMatchObject({ itemId: ADD_UP })
    expect(suggest().resume?.reason).toContain('has not been checked yet')
  })

  it('suggests a fresh attempt, and a different task, after the solution was revealed', () => {
    store.revealSolution(TOTALS)
    store.recordCheck(TOTALS, passing(clock.now()), 'copied')
    const { suggestions } = suggest()
    expect(suggestions[0]).toMatchObject({ rule: 'retry', itemId: TOTALS })
    expect(suggestions[0]?.reason).toContain('worked solution')
    expect(suggestions[1]).toMatchObject({ rule: 'retry', itemId: 'running-products' })
  })

  it('suggests the next exercise of a skill marked as confusing', () => {
    store.setSkillConfusing('accumulators', true)
    const first = content.exercisesOf('accumulators')[0]
    const { suggestions } = suggest()
    expect(suggestions[0]).toMatchObject({ rule: 'confusing-skill', itemId: first?.id })
    expect(suggestions[0]?.reason).toContain('You marked Accumulators as confusing')
  })

  it('suggests what builds on the most recent pass, naming the one new idea', () => {
    store.recordCheck(TOTALS, passing(clock.now()), 'own')
    store.reportOutsideHelp(TOTALS, 'no')
    const followUp = suggest().suggestions.find((suggestion) => suggestion.itemId === 'running-products')
    expect(followUp?.rule).toBe('next-step')
    expect(followUp?.reason).toContain('You passed Running totals today.')
    expect(followUp?.reason).toContain('It adds one idea:')
  })

  it('suggests revisiting a pass with help after two days, not before', () => {
    store.openHint(ADD_UP, 1)
    store.recordCheck(ADD_UP, passing(clock.now()), 'helped')
    clock.days(1)
    expect(suggest().suggestions.some((suggestion) => suggestion.rule === 'revisit')).toBe(false)
    clock.days(1)
    const revisit = suggest().suggestions.find((suggestion) => suggestion.rule === 'revisit')
    expect(revisit).toMatchObject({ itemId: ADD_UP })
    expect(revisit?.reason).toContain('with help 2 days ago')
  })

  it('never suggests the same exercise twice, and never more than the limit', () => {
    store.setSkillConfusing('accumulators', true)
    store.revealSolution(TOTALS)
    store.recordCheck(TOTALS, passing(clock.now()), 'copied')
    store.openHint(ADD_UP, 1)
    store.recordCheck(ADD_UP, passing(clock.now()), 'helped')
    clock.days(3)
    const { suggestions } = suggest()
    expect(suggestions.length).toBeLessThanOrEqual(MAX_SUGGESTIONS)
    expect(new Set(suggestions.map((suggestion) => suggestion.itemId)).size).toBe(suggestions.length)
  })
})

describe('feedback for a failed check', () => {
  const item = codeItem(TOTALS)
  const test = (overrides: Partial<Extract<TestOutcome, { ran: true }>>): Extract<TestOutcome, { ran: true }> => ({
    ran: true,
    name: 'three items',
    purpose: '',
    given: 'numbers = [3, 1, 4]\n',
    status: 'fail',
    error: null,
    stopLine: null,
    stdout: '',
    outputTruncated: false,
    variables: [],
    checks: [],
    mistakeId: null,
    ...overrides,
  })

  it('shows the prepared feedback of the recognised mistake', () => {
    expect(feedbackFor(item, test({ mistakeId: 'records-before-adding' }), false)?.id).toBe('records-before-adding')
    expect(feedbackFor(item, test({ mistakeId: null }), false)).toBeNull()
  })

  it('gives no mistake feedback for untouched starter code of a writing task', () => {
    expect(feedbackFor(item, test({ mistakeId: 'records-current-item' }), true)).toBeNull()
  })

  it('still explains the bug in the starter of a repair task', () => {
    const repair = codeItem('accumulators-product-start')
    expect(feedbackFor(repair, test({ mistakeId: 'starts-at-zero' }), true)?.id).toBe('starts-at-zero')
  })

  it('uses the "never stops" feedback when a program had to be stopped', () => {
    const counting = codeItem('accumulators-count-failed')
    expect(feedbackFor(counting, test({ status: 'stopped', mistakeId: null }), false)?.id).toBe('never-moves-on')
  })

  it('summarises a check for saving', () => {
    const result: CheckResult = {
      inspection: { parsed: true, forbidden: [{ what: 'sum()', line: 2 }], hardCoded: [] },
      passed: false,
      tests: [
        test({ status: 'pass' }),
        test({
          name: 'one item',
          status: 'fail',
          mistakeId: 'records-position',
          checks: [
            { kind: 'variable', target: 'running_totals', ok: false, missing: false, expected: '[9]', actual: '[0]', note: 'a note', similar: [] },
          ],
        }),
        { ran: false, name: 'later', purpose: '', given: '' },
      ],
    }
    const record = toCheckRecord(item, result, 'code', '2026-10-05T10:00:00.000Z')
    expect(record).toMatchObject({ passed: false, passedCount: 1, total: 3 })
    expect(record.problem).toMatchObject({ name: 'one item', status: 'fail' })
    expect(record.problem?.lines).toEqual([{ target: 'running_totals', expected: '[9]', actual: '[0]', missing: false, note: 'a note' }])
    expect(record.problem?.feedback).toContain('positions 0, 1, 2')
    expect(record.restrictions).toEqual(['Line 2 uses `sum()`, which this exercise asks you not to use.'])
  })
})

describe('the help message', () => {
  const item = codeItem(TOTALS)
  const myCode = 'running_totals = []\nposition = 0\nwhile position < len(numbers):\n    running_totals.append(numbers[position])\n    position = position + 1\n'

  function message(confusion = '') {
    const attempt = store.getState().items[TOTALS]?.attempts.at(-1)
    return buildHelpContext({ item, content, code: myCode, given: 'numbers = [3, 1, 4]\n', answers: [], attempt, confusion })
  }

  it('holds the task, the code, the latest result and the help used', () => {
    store.recordCheck(TOTALS, failing(clock.now()), myCode)
    store.openHint(TOTALS, 2)
    store.visit(ADD_UP, TOTALS)
    const text = message('I do not see why the totals are not adding up.')

    expect(text).toContain('Title: Running totals')
    expect(text).toContain('Identifier: running-totals')
    expect(text).toContain('https://leetcode.com/problems/running-sum-of-1d-array/')
    expect(text).toContain('not LeetCode\'s wording')
    expect(text).toContain('`numbers`: a list of whole numbers')
    expect(text).toContain('`running_totals`: a new list with one total for every item of `numbers`')
    expect(text).toContain(myCode.trim())
    expect(text).toContain('2 of 6 tests passed')
    expect(text).toContain('First test that did not pass: "negative items"')
    expect(text).toContain('Input: numbers = [5, -2, -4]')
    expect(text).toContain('Expected running_totals: [5, 3, -1]')
    expect(text).toContain('Actual running_totals: [5, -2, -4]')
    expect(text).toContain('Error: none')
    expect(text).toContain(`Hint 1 (I have read it): ${item.hints[0]?.replaceAll('\n', ' ').trim()}`)
    expect(text).toContain('Hint 2 (I have read it)')
    expect(text).toContain('Warm-up exercises I went to from here: Add up a list.')
    expect(text).toContain('I do not see why the totals are not adding up.')
    expect(text).toContain('beginner')
    expect(text).toContain('one new idea at a time')
    expect(text).toContain('do not give me the finished solution')
  })

  it('leaves out the reference solution and the hints that were not opened', () => {
    store.recordCheck(TOTALS, failing(clock.now()), myCode)
    store.openHint(TOTALS, 1)
    const text = message()
    expect(text).not.toContain('running_totals.append(total)')
    expect(text).not.toContain(item.hints[1]?.slice(0, 40) ?? 'no second hint')
    expect(text).not.toContain(item.solution.walkthrough.slice(0, 40))
    expect(text).toContain('I have not opened the worked solution')
    expect(text).not.toContain('/home/')
  })

  it('says so when the solution was opened, without including it', () => {
    store.revealSolution(TOTALS)
    const text = message()
    expect(text).toContain('I have opened the worked solution.')
    expect(text).not.toContain('running_totals.append(total)')
  })

  it('reports an error and a stopped program in words', () => {
    const errored = failing(clock.now())
    if (errored.problem) {
      errored.problem.status = 'error'
      errored.problem.lines = []
      errored.problem.error = { type: 'IndexError', message: 'list index out of range', line: 4 }
    }
    store.recordCheck(TOTALS, errored, myCode)
    expect(message()).toContain('Error: IndexError: list index out of range on line 4')

    const stopped = failing(clock.now())
    if (stopped.problem) {
      stopped.problem.status = 'stopped'
      stopped.problem.lines = []
      stopped.problem.stopReason = 'time-limit'
    }
    store.recordCheck(TOTALS, stopped, myCode)
    expect(message()).toContain('the app stopped it (it probably never ends)')
  })

  it('for a prediction, includes the program and the answers but not the true results', () => {
    const predict = predictItem('accumulators-replace-or-add')
    store.recordPredict(predict.id, { at: clock.now(), answers: ['4\n15', '3'], correct: [false, true] })
    const attempt = store.getState().items[predict.id]?.attempts.at(-1)
    const text = buildHelpContext({ item: predict, content, code: '', given: '', answers: ['4\n15', '3'], attempt, confusion: '' })
    expect(text).toContain('latest = numbers[position]')
    expect(text).toContain('4\n15')
    expect(text).toContain('The app marked this answer wrong.')
    expect(text).toContain('The app marked this answer right.')
    expect(text).toContain('The true results are not included here on purpose')
    expect(text).not.toContain('5\n15')
  })
})
