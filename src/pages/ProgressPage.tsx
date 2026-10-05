// "Progress and backup": what has been recorded, in plain counts, and a way to save it to
// a file and bring it back.

import { useRef, useState } from 'preact/hooks'
import { content } from '../content/index.ts'
import { href } from '../router.ts'
import { parseBackup, serializeBackup, summarize, MAX_BACKUP_BYTES, type BackupSummary } from '../state/backup.ts'
import { store, useAppState } from '../state/hooks.ts'
import {
  attemptOutcome,
  itemStatus,
  STATUS_MEANINGS,
  usedHelp,
  type AppState,
  type Attempt,
  type ItemStatus,
} from '../state/progress.ts'
import { when } from '../state/recommend.ts'
import { CodeBlock } from '../ui/CodeBlock.tsx'
import { StatusBadge } from '../ui/common.tsx'

const APP_NAME = 'Stepwise 0.1.0'
const STATUS_ORDER: ItemStatus[] = ['revisited', 'passed-independent', 'passed-unreported', 'passed-with-help', 'attempted', 'not-started']

type ImportState =
  | { step: 'idle' }
  | { step: 'refused'; fileName: string; errors: string[] }
  | { step: 'ready'; fileName: string; state: AppState; summary: BackupSummary; exportedAt: string | null }
  | { step: 'done'; message: string }

function describeHelp(attempt: Attempt): string {
  const help = attempt.helpAtPass ?? attempt.help
  const parts: string[] = []
  if (help.hints > 0) parts.push(`${help.hints} ${help.hints === 1 ? 'hint' : 'hints'}`)
  if (help.explanation) parts.push('the explanation')
  if (help.solution) parts.push('the worked solution')
  if (help.steppedThrough) parts.push('the step-through')
  if (attempt.outsideHelp === 'yes') parts.push('outside help (your report)')
  if (parts.length === 0) return attempt.outsideHelp === 'no' ? 'No help (your report)' : 'No in-app help; outside help not reported'
  return `Used ${parts.join(', ')}`
}

function describeSummary(summary: BackupSummary): string {
  return `${summary.itemsWithProgress} exercises with recorded work (${summary.passes} passed), ${summary.drafts} saved drafts, ${summary.skillsMarked} skills marked as confusing`
}

export function ProgressPage() {
  const state = useAppState()
  const [importState, setImportState] = useState<ImportState>({ step: 'idle' })
  const [, refresh] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const now = new Date()

  const statuses = content.items.map((item) => itemStatus(state.items[item.id]))
  const worked = content.items
    .filter((item) => (state.items[item.id]?.attempts.length ?? 0) > 0)
    .sort((a, b) => (state.items[b.id]?.lastWorkedAt ?? '').localeCompare(state.items[a.id]?.lastWorkedAt ?? ''))
  const current = summarize(state)

  const download = () => {
    const text = serializeBackup(state, new Date().toISOString(), APP_NAME)
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const day = new Date().toISOString().slice(0, 10)
    link.download = `stepwise-backup-${day}.json`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(link.href)
  }

  const readFile = async (file: File) => {
    if (file.size > MAX_BACKUP_BYTES) {
      setImportState({ step: 'refused', fileName: file.name, errors: ['This file is larger than any backup this app would write, so it was not read.'] })
      return
    }
    const parsed = parseBackup(await file.text())
    if (!parsed.ok) {
      setImportState({ step: 'refused', fileName: file.name, errors: parsed.errors })
      return
    }
    setImportState({ step: 'ready', fileName: file.name, state: parsed.state, summary: summarize(parsed.state), exportedAt: parsed.exportedAt })
  }

  return (
    <div class="page">
      <h1>Progress and backup</h1>
      <p class="lead">
        What this app has recorded, in plain counts. A pass shows that code was right for the cases that were tested. It
        is evidence, not a measure of how well something is understood.
      </p>
      {store.loadWarning && (
        <p class="notice" role="alert">
          {store.loadWarning}
        </p>
      )}
      {store.saveError && (
        <p class="notice" role="alert">
          {store.saveError}
        </p>
      )}

      <section aria-labelledby="counts-title">
        <h2 id="counts-title">Where the {content.items.length} exercises stand</h2>
        <dl class="status-counts">
          {STATUS_ORDER.map((status) => (
            <div key={status}>
              <dt>
                <StatusBadge status={status} />
              </dt>
              <dd>
                <span class="count">{statuses.filter((entry) => entry === status).length}</span>
                <span class="quiet">{STATUS_MEANINGS[status]}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="history-title">
        <h2 id="history-title">What you have worked on</h2>
        {worked.length === 0 ? (
          <p class="quiet">
            Nothing yet. <a href={href.home()}>Go to Continue</a> for a place to start.
          </p>
        ) : (
          <ul class="history">
            {worked.map((item) => {
              const progress = state.items[item.id]
              if (!progress) return null
              return (
                <li key={item.id}>
                  <details>
                    <summary>
                      <span class="history-title">{item.title}</span>
                      <StatusBadge status={itemStatus(progress)} />
                      <span class="quiet">last worked on {when(progress.lastWorkedAt, now)}</span>
                    </summary>
                    <p>
                      <a href={href.practice(item.id)}>Open {item.title}</a>
                    </p>
                    <ol class="attempts">
                      {progress.attempts.map((attempt, index) => {
                        const outcome = attemptOutcome(attempt)
                        return (
                          <li key={index}>
                            <p>
                              <strong>Attempt {index + 1}</strong>, started {when(attempt.startedAt, now)}
                              {attempt.fresh && index > 0 ? ' from a blank start' : ''}:{' '}
                              {outcome === 'in-progress'
                                ? 'not passed'
                                : outcome === 'passed-independent'
                                  ? 'passed, reported independent'
                                  : outcome === 'passed-with-help'
                                    ? 'passed with help'
                                    : 'passed, help not reported'}
                              . {attempt.runs} runs, {attempt.checks} checks.{' '}
                              {attempt.passedAt || usedHelp(attempt.help) || attempt.outsideHelp ? `${describeHelp(attempt)}.` : ''}
                            </p>
                            {attempt.passedAt && !usedHelp(attempt.helpAtPass ?? attempt.help) && (
                              <fieldset class="report report--inline">
                                <legend>Outside help for this attempt</legend>
                                <label class="choice">
                                  <input
                                    type="radio"
                                    name={`history-${item.id}-${index}`}
                                    checked={attempt.outsideHelp === 'no'}
                                    disabled={index !== progress.attempts.length - 1}
                                    onChange={() => store.reportOutsideHelp(item.id, 'no')}
                                  />
                                  None
                                </label>
                                <label class="choice">
                                  <input
                                    type="radio"
                                    name={`history-${item.id}-${index}`}
                                    checked={attempt.outsideHelp === 'yes'}
                                    disabled={index !== progress.attempts.length - 1}
                                    onChange={() => store.reportOutsideHelp(item.id, 'yes')}
                                  />
                                  Some
                                </label>
                              </fieldset>
                            )}
                            {attempt.finalCode && (
                              <details class="kept-code">
                                <summary>{attempt.passedAt ? 'The code that passed' : 'The code this attempt ended with'}</summary>
                                <CodeBlock code={attempt.finalCode} numbered />
                              </details>
                            )}
                          </li>
                        )
                      })}
                    </ol>
                  </details>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="backup-title">
        <h2 id="backup-title">Backup</h2>
        <p>
          Your progress and your drafts are kept by this browser, for the address <code>{window.location.origin}</code>. They
          are not stored anywhere else. Clearing the browser's site data, or using another browser, starts empty. A backup
          file protects against that.
        </p>
        <p class="quiet">Right now: {describeSummary(current)}.</p>
        <div class="button-row">
          <button type="button" class="button button--primary" onClick={download}>
            Download a backup file
          </button>
          <button type="button" class="button" onClick={() => fileInput.current?.click()}>
            Import a backup file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            class="visually-hidden"
            aria-label="Choose a backup file to import"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) void readFile(file)
            }}
          />
        </div>

        <div role="status" aria-live="polite">
          {importState.step === 'refused' && (
            <div class="trouble">
              <p class="trouble-summary">"{importState.fileName}" was not imported. Nothing was changed.</p>
              <ul>
                {importState.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          {importState.step === 'ready' && (
            <div class="notice">
              <p>
                "{importState.fileName}" is a valid backup{importState.exportedAt ? `, saved ${when(importState.exportedAt, now)}` : ''}. It
                holds {describeSummary(importState.summary)}.
              </p>
              <p>
                Importing replaces what this browser has now ({describeSummary(current)}). The current state is kept so that
                you can undo the import.
              </p>
              <div class="button-row">
                <button
                  type="button"
                  class="button button--primary"
                  onClick={() => {
                    store.replaceAll(importState.state)
                    setImportState({ step: 'done', message: 'The backup was imported. Use "Undo the last import" if this was not what you wanted.' })
                  }}
                >
                  Replace my progress with this backup
                </button>
                <button type="button" class="button" onClick={() => setImportState({ step: 'idle' })}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {importState.step === 'done' && <p class="notice">{importState.message}</p>}
        </div>

        {store.canUndoImport && (
          <p>
            <button
              type="button"
              class="button"
              onClick={() => {
                const restored = store.undoImport()
                setImportState({
                  step: 'done',
                  message: restored ? 'The import was undone. Your earlier progress is back.' : 'The earlier progress could not be read, so nothing was changed.',
                })
                refresh((value) => value + 1)
              }}
            >
              Undo the last import
            </button>
          </p>
        )}
        <p class="quiet">
          The file is plain JSON with a version number. It contains your progress records and your code drafts, and nothing
          about your computer.
        </p>
      </section>
    </div>
  )
}
