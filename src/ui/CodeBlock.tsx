// Read-only Python code with the same coloring as the editor, optional line numbers, and
// markers for "the line that just ran" and "the line that runs next".

import { pythonLanguage } from '@codemirror/lang-python'
import { classHighlighter, highlightTree } from '@lezer/highlight'
import type { ComponentChildren } from 'preact'
import { useMemo } from 'preact/hooks'

interface Piece {
  text: string
  className: string | null
}

/** Split Python source into lines of colored pieces. */
export function highlightPython(code: string): Piece[][] {
  const spans: { from: number; to: number; className: string }[] = []
  highlightTree(pythonLanguage.parser.parse(code), classHighlighter, (from, to, className) => {
    spans.push({ from, to, className })
  })
  const lines: Piece[][] = []
  let offset = 0
  let spanIndex = 0
  for (const line of code.split('\n')) {
    const end = offset + line.length
    const pieces: Piece[] = []
    let cursor = offset
    while (spanIndex < spans.length) {
      const span = spans[spanIndex]
      if (!span || span.from >= end) break
      const from = Math.max(span.from, offset)
      const to = Math.min(span.to, end)
      if (from > cursor) pieces.push({ text: code.slice(cursor, from), className: null })
      if (to > from) pieces.push({ text: code.slice(from, to), className: span.className })
      cursor = Math.max(cursor, to)
      if (span.to > end) break
      spanIndex += 1
    }
    if (cursor < end) pieces.push({ text: code.slice(cursor, end), className: null })
    lines.push(pieces)
    offset = end + 1
  }
  return lines
}

interface CodeBlockProps {
  code: string
  /** Show the text without Python coloring (for output and other plain text). */
  plain?: boolean
  numbered?: boolean
  /** 1-based number of the line that just ran. */
  ranLine?: number | null
  /** 1-based number of the line that runs next. */
  nextLine?: number | null
  /** 1-based number of a line with a problem. */
  problemLine?: number | null
  label?: string
}

export function CodeBlock({ code, plain = false, numbered = false, ranLine, nextLine, problemLine, label }: CodeBlockProps) {
  const trimmed = code.replace(/\s+$/, '')
  const lines = useMemo<Piece[][]>(
    () => (plain ? trimmed.split('\n').map((text) => [{ text, className: null }]) : highlightPython(trimmed)),
    [trimmed, plain],
  )
  return (
    <pre class={`code-block${numbered ? ' code-block--numbered' : ''}`} aria-label={label} tabIndex={label ? 0 : undefined}>
      <code>
        {lines.map((pieces, index) => {
          const number = index + 1
          const classes = ['code-line']
          if (ranLine === number) classes.push('code-line--ran')
          if (nextLine === number) classes.push('code-line--next')
          if (problemLine === number) classes.push('code-line--problem')
          const content: ComponentChildren = pieces.map((piece, pieceIndex) =>
            piece.className ? (
              <span key={pieceIndex} class={piece.className}>
                {piece.text}
              </span>
            ) : (
              piece.text
            ),
          )
          return (
            <span key={index} class={classes.join(' ')}>
              {numbered && (
                <span class="code-number" aria-hidden="true">
                  {number}
                </span>
              )}
              <span class="code-text">{pieces.length > 0 ? content : ' '}</span>
              {'\n'}
            </span>
          )
        })}
      </code>
    </pre>
  )
}
