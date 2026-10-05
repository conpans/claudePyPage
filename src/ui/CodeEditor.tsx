// The code editor: CodeMirror 6 with a small, calm setup for beginners.
// No autocompletion pop-ups; Tab indents by four spaces; Ctrl+Enter runs.

import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { EditorState, Prec, StateEffect, StateField } from '@codemirror/state'
import {
  Decoration,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type DecorationSet,
} from '@codemirror/view'
import { classHighlighter } from '@lezer/highlight'
import { useEffect, useRef } from 'preact/hooks'

const setProblemLine = StateEffect.define<number | null>()

const problemLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes)
    for (const effect of transaction.effects) {
      if (!effect.is(setProblemLine)) continue
      const line = effect.value
      if (line === null || line < 1 || line > transaction.state.doc.lines) {
        next = Decoration.none
      } else {
        next = Decoration.set([Decoration.line({ class: 'cm-problem-line' }).range(transaction.state.doc.line(line).from)])
      }
    }
    // Editing the code makes the old marker stale.
    if (transaction.docChanged && !transaction.effects.some((effect) => effect.is(setProblemLine))) next = Decoration.none
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

interface CodeEditorProps {
  /** The code the editor starts with, and the code it is reset to when `revision` changes. */
  value: string
  /**
   * While the learner types, the editor itself holds the code and reports it through
   * `onChange`. It is never overwritten from `value` on an ordinary re-render: doing that
   * with a value from a moment ago would undo newer keystrokes. Increase `revision` to
   * replace the editor's content on purpose (reset to the starter code).
   */
  revision: number
  label: string
  onChange: (code: string) => void
  /** Ctrl+Enter (Cmd+Enter on a Mac). */
  onRun: () => void
  /** Ctrl+Shift+Enter. */
  onCheck: () => void
  problemLine: number | null
}

export function CodeEditor({ value, revision, label, onChange, onRun, onCheck, problemLine }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const appliedRevision = useRef(revision)
  // The editor is created once; these refs let its key bindings reach the latest callbacks.
  const callbacks = useRef({ onChange, onRun, onCheck })
  callbacks.current = { onChange, onRun, onCheck }

  useEffect(() => {
    if (!host.current) return
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          indentUnit.of('    '),
          EditorState.tabSize.of(4),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          python(),
          syntaxHighlighting(classHighlighter),
          problemLineField,
          Prec.highest(
            keymap.of([
              {
                key: 'Mod-Enter',
                run: () => {
                  callbacks.current.onRun()
                  return true
                },
              },
              {
                key: 'Shift-Mod-Enter',
                run: () => {
                  callbacks.current.onCheck()
                  return true
                },
              },
            ]),
          ),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false', autocapitalize: 'off' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
    // The editor is deliberately created once per mount; later changes arrive through the effects below.
  }, [])

  // The code was replaced on purpose from outside (reset to the starter).
  useEffect(() => {
    if (appliedRevision.current === revision) return
    appliedRevision.current = revision
    const editor = view.current
    if (!editor) return
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
    // `value` is read at the moment the revision changes; later values are the editor's own.
  }, [revision])

  useEffect(() => {
    view.current?.dispatch({ effects: setProblemLine.of(problemLine) })
  }, [problemLine])

  return <div class="editor" ref={host} />
}
