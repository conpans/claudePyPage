// Renders the small subset of Markdown that content files use: paragraphs, inline code,
// bold, italic, links, bullet and numbered lists, fenced code blocks and simple tables.
// It builds elements directly and never inserts raw HTML, so content cannot inject markup.

import type { ComponentChildren } from 'preact'
import { CodeBlock } from './CodeBlock.tsx'

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\))/g

export function inline(text: string): ComponentChildren[] {
  return text.split(INLINE).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={index}>{part.slice(1, -1)}</code>
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={index}>{part.slice(1, -1)}</em>
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
    if (link) {
      const [, label = '', target = ''] = link
      if (/^https?:\/\//.test(target)) {
        return (
          <a key={index} href={target} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        )
      }
      return label
    }
    return part
  })
}

type Block =
  | { kind: 'paragraph'; text: string }
  | { kind: 'code'; language: string; code: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] }

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim())
}

function parse(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (line.trim() === '') {
      index += 1
      continue
    }
    const fence = /^```(\w*)\s*$/.exec(line.trim())
    if (fence) {
      const body: string[] = []
      index += 1
      while (index < lines.length && (lines[index] ?? '').trim() !== '```') {
        body.push(lines[index] ?? '')
        index += 1
      }
      index += 1
      blocks.push({ kind: 'code', language: fence[1] ?? '', code: body.join('\n') })
      continue
    }
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = []
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('|')) {
        tableLines.push(lines[index] ?? '')
        index += 1
      }
      const [header = '', ...rest] = tableLines
      const rows = rest.filter((row) => !/^\|?[\s:|-]+\|?$/.test(row.trim()))
      blocks.push({ kind: 'table', header: cells(header), rows: rows.map(cells) })
      continue
    }
    const bullet = /^\s*[-*]\s+(.*)$/
    const numbered = /^\s*\d+[.)]\s+(.*)$/
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line)
      const pattern = ordered ? numbered : bullet
      const items: string[] = []
      while (index < lines.length) {
        const current = lines[index] ?? ''
        const match = pattern.exec(current)
        if (match) {
          items.push(match[1] ?? '')
        } else if (current.trim() !== '' && /^\s{2,}/.test(current) && items.length > 0) {
          // An indented line continues the item above it.
          items[items.length - 1] = `${items[items.length - 1] ?? ''} ${current.trim()}`
        } else {
          break
        }
        index += 1
      }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }
    // The current line always belongs to the paragraph, so every pass moves forward.
    const paragraph: string[] = [line.trim()]
    index += 1
    while (index < lines.length) {
      const current = lines[index] ?? ''
      if (current.trim() === '' || current.trim().startsWith('```') || current.trim().startsWith('|')) break
      if (bullet.test(current) || numbered.test(current)) break
      paragraph.push(current.trim())
      index += 1
    }
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
  }
  return blocks
}

export function Markdown({ source, class: className }: { source: string; class?: string }) {
  return (
    <div class={`prose ${className ?? ''}`}>
      {parse(source).map((block, index) => {
        switch (block.kind) {
          case 'paragraph':
            return <p key={index}>{inline(block.text)}</p>
          case 'code':
            return <CodeBlock key={index} code={block.code} plain={block.language !== 'python'} />
          case 'list': {
            const items = block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)
            return block.ordered ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>
          }
          case 'table':
            return (
              <div key={index} class="table-scroll">
                <table class="value-table">
                  <thead>
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        <th key={cellIndex} scope="col">
                          {inline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{inline(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        }
      })}
    </div>
  )
}

/** One line of text with inline formatting, for notes and feedback. */
export function InlineText({ text }: { text: string }) {
  return <>{inline(text)}</>
}
