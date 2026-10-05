// Small pieces shared by several pages.

import type { ComponentChildren } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { content } from '../content/index.ts'
import { DIFFICULTY_LABELS, FORMAT_LABELS, TIER_LABELS, type Item } from '../content/schema.ts'
import { href } from '../router.ts'
import { useRuntimeStatus } from '../state/hooks.ts'
import { STATUS_LABELS, STATUS_MEANINGS, type ItemStatus } from '../state/progress.ts'

/** A status as a word plus a mark, so it never depends on color alone. */
const STATUS_MARKS: Record<ItemStatus, string> = {
  'not-started': '○',
  attempted: '◐',
  'passed-with-help': '◑',
  'passed-unreported': '●',
  'passed-independent': '●',
  revisited: '✦',
}

export function StatusBadge({ status }: { status: ItemStatus }) {
  return (
    <span class={`status status--${status}`} title={STATUS_MEANINGS[status]}>
      <span class="status-mark" aria-hidden="true">
        {STATUS_MARKS[status]}
      </span>
      {STATUS_LABELS[status]}
    </span>
  )
}

/** A row of small marks, one per item: an at-a-glance record, not a score. */
export function StatusDots({ statuses, label }: { statuses: ItemStatus[]; label: string }) {
  return (
    <span class="dots" role="img" aria-label={label} title={label}>
      {statuses.map((status, index) => (
        <span key={index} class={`dot dot--${status}`} />
      ))}
    </span>
  )
}

export function SkillLinks({ item }: { item: Item }) {
  return (
    <span class="chips">
      {content.skillsOf(item).map((skill) => (
        <a key={skill.id} class="chip" href={href.skill(skill.id)}>
          {skill.shortTitle}
        </a>
      ))}
    </span>
  )
}

export function ItemMeta({ item }: { item: Item }) {
  return (
    <span class="meta">
      <span>{TIER_LABELS[item.tier]}</span>
      <span>{FORMAT_LABELS[item.format]}</span>
      <span>{DIFFICULTY_LABELS[item.difficulty]}</span>
      <span>{item.source.type === 'leetcode-adaptation' ? `Adapted from LeetCode ${item.source.number ?? ''}` : 'Original'}</span>
    </span>
  )
}

export function PythonStatus() {
  const status = useRuntimeStatus()
  const text =
    status.state === 'ready'
      ? `Python ${status.pythonVersion} ready`
      : status.state === 'busy'
        ? 'Python is running'
        : status.state === 'failed'
          ? 'Python could not start'
          : status.state === 'restarting'
            ? 'Restarting Python'
            : 'Starting Python'
  return (
    <span class={`python-status python-status--${status.state}`} role="status">
      <span class="python-status-dot" aria-hidden="true" />
      {text}
    </span>
  )
}

interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ComponentChildren
  wide?: boolean
}

/** A modal dialog built on the browser's own <dialog>, which handles focus and Escape. */
export function Dialog({ open, title, onClose, children, wide }: DialogProps) {
  const element = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = element.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={element}
      class={`dialog${wide ? ' dialog--wide' : ''}`}
      aria-labelledby="dialog-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop (outside the panel) closes the dialog.
        if (event.target === element.current) onClose()
      }}
    >
      {open && (
        <div class="dialog-panel">
          <header class="dialog-head">
            <h2 id="dialog-title">{title}</h2>
            <button type="button" class="button button--quiet" onClick={onClose}>
              Close
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  )
}

/** A link to an item that remembers where the learner came from. */
export function ItemLink({ item, from, children }: { item: Item; from?: string | null; children?: ComponentChildren }) {
  return <a href={href.practice(item.id, from)}>{children ?? item.title}</a>
}
