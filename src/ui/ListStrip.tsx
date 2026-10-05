// A list drawn as a row of boxes, with the two things that are easy to mix up kept visibly
// apart: the VALUES sit inside the boxes, and the POSITIONS are printed underneath, outside
// them. A marker shows where each position variable currently points.

import type { EncodedValue } from '../python/protocol.ts'

export interface Pointer {
  /** The variable's name, such as `position`. */
  name: string
  /** Its current whole-number value. */
  value: number
}

interface ListStripProps {
  name: string
  list: EncodedValue
  /** The same list one step earlier, to mark what changed. */
  before?: EncodedValue | null
  pointers?: Pointer[]
}

interface Placement {
  pointer: Pointer
  /** Column the marker sits under, or null when the position is outside the drawn list. */
  column: number | null
  note: string | null
}

function place(pointer: Pointer, length: number, shown: number): Placement {
  const { value } = pointer
  if (value >= 0 && value < length) {
    return { pointer, column: value < shown ? value : null, note: value < shown ? null : 'further along than the boxes shown' }
  }
  if (value === length) return { pointer, column: shown === length ? length : null, note: 'one past the last item' }
  if (value < 0 && -value <= length) {
    const column = length + value
    return { pointer, column: column < shown ? column : null, note: 'a negative position counts from the end' }
  }
  return { pointer, column: null, note: 'outside the list' }
}

export function ListStrip({ name, list, before, pointers = [] }: ListStripProps) {
  const items = list.items ?? []
  const length = list.length ?? items.length
  const shown = items.length
  const placements = pointers.map((pointer) => place(pointer, length, shown))
  const needsGhost = placements.some((placement) => placement.column === length)
  const pointedColumns = new Set(placements.flatMap((placement) => (placement.column !== null ? [placement.column] : [])))
  const beforeItems = before?.kind === 'list' ? (before.items ?? []) : null
  const columns = shown + (needsGhost ? 1 : 0)

  const spoken = [
    `${name} is a list with ${length} ${length === 1 ? 'item' : 'items'}.`,
    ...items.map((item, index) => `Position ${index} holds ${item.text}.`),
    ...placements.map((placement) =>
      placement.column !== null && placement.column < length
        ? `${placement.pointer.name} is ${placement.pointer.value}, so it points at the item ${items[placement.column]?.text ?? ''}.`
        : `${placement.pointer.name} is ${placement.pointer.value}, ${placement.note ?? 'outside the list'}.`,
    ),
  ].join(' ')

  return (
    <div class="strip">
      <p class="visually-hidden">{spoken}</p>
      <div class="strip-scroll" aria-hidden="true">
        <div class="strip-grid" style={{ gridTemplateColumns: `auto repeat(${Math.max(columns, 1)}, minmax(2.75rem, max-content))` }}>
          <div class="strip-name" style={{ gridRow: 1, gridColumn: 1 }}>
            <code>{name}</code>
          </div>
          {shown === 0 && !needsGhost && (
            <div class="strip-empty" style={{ gridRow: 1, gridColumn: 2 }}>
              empty list
            </div>
          )}
          {items.map((item, index) => {
            const classes = ['strip-cell']
            if (pointedColumns.has(index)) classes.push('strip-cell--current')
            if (beforeItems) {
              if (index >= beforeItems.length) classes.push('strip-cell--added')
              else if (beforeItems[index]?.text !== item.text) classes.push('strip-cell--changed')
            }
            return (
              <div key={`value-${index}`} class={classes.join(' ')} style={{ gridRow: 1, gridColumn: index + 2 }}>
                {item.text}
              </div>
            )
          })}
          {needsGhost && (
            <div class="strip-cell strip-cell--ghost" style={{ gridRow: 1, gridColumn: length + 2 }}>
              no item
            </div>
          )}

          <div class="strip-rowlabel" style={{ gridRow: 2, gridColumn: 1 }}>
            positions
          </div>
          {items.map((_, index) => (
            <div
              key={`position-${index}`}
              class={`strip-position${pointedColumns.has(index) ? ' strip-position--current' : ''}`}
              style={{ gridRow: 2, gridColumn: index + 2 }}
            >
              {index}
            </div>
          ))}
          {needsGhost && (
            <div class="strip-position strip-position--ghost" style={{ gridRow: 2, gridColumn: length + 2 }}>
              {length}
            </div>
          )}

          {placements.map((placement, index) =>
            placement.column === null ? null : (
              <div
                key={`pointer-${placement.pointer.name}`}
                class={`strip-pointer${placement.column === length ? ' strip-pointer--outside' : ''}`}
                style={{ gridRow: 3 + index, gridColumn: placement.column + 2 }}
              >
                <span class="strip-arrow">▲</span>
                <code>{placement.pointer.name}</code>
              </div>
            ),
          )}
        </div>
      </div>
      <p class="strip-facts">
        <code>len({name})</code> is {length}.{' '}
        {length > 0 ? (
          <>
            The positions go from 0 to {length - 1}.
          </>
        ) : (
          <>There are no positions yet.</>
        )}
        {shown < length && <> Only the first {shown} items are drawn.</>}
        {placements
          .filter((placement) => placement.note !== null)
          .map((placement) => (
            <span key={placement.pointer.name} class="strip-note">
              {' '}
              <code>{placement.pointer.name}</code> is {placement.pointer.value}: {placement.note}.
            </span>
          ))}
      </p>
    </div>
  )
}
