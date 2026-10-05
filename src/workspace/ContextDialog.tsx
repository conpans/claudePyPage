// "Copy context for help": shows exactly what will be copied, lets the learner add where
// they are stuck, and copies it. Nothing is sent anywhere by the app; the learner pastes the
// text into whatever chat or message they choose.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { content } from '../content/index.ts'
import type { Item } from '../content/schema.ts'
import { buildHelpContext } from '../help/context.ts'
import { store } from '../state/hooks.ts'
import type { Attempt } from '../state/progress.ts'
import { Dialog } from '../ui/common.tsx'

interface ContextDialogProps {
  open: boolean
  onClose: () => void
  item: Item
  code: string
  given: string
  answers: string[]
  attempt: Attempt | undefined
}

type CopyState = 'idle' | 'copied' | 'manual'

export function ContextDialog({ open, onClose, item, code, given, answers, attempt }: ContextDialogProps) {
  const [confusion, setConfusion] = useState('')
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const preview = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) setCopyState('idle')
  }, [open])

  const message = useMemo(
    () => buildHelpContext({ item, content, code, given, answers, attempt, confusion }),
    [item, code, given, answers, attempt, confusion],
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopyState('copied')
      store.recordContextCopied(item.id)
    } catch {
      // The browser refused (no permission, or the page is not allowed to use the clipboard).
      // Select the text so the learner can copy it with the keyboard instead.
      setCopyState('manual')
      preview.current?.focus()
      preview.current?.select()
      store.recordContextCopied(item.id)
    }
  }

  return (
    <Dialog open={open} title="Copy context for help" onClose={onClose} wide>
      <p>
        This builds a message you can paste into an AI chat, or send to a person. The app does not send it anywhere. It
        holds the task, your code, your latest result and the help you have already opened. It leaves out the worked
        solution and any hints you have not opened.
      </p>
      <label class="field">
        <span class="field-label">Where are you stuck? (optional, in your own words)</span>
        <textarea
          class="field-input"
          rows={3}
          value={confusion}
          onInput={(event) => setConfusion(event.currentTarget.value)}
          placeholder="For example: I do not see why my list has only one item."
        />
      </label>
      <label class="field">
        <span class="field-label">The message that will be copied</span>
        <textarea ref={preview} class="field-input field-input--code" rows={14} readOnly value={message} />
      </label>
      <div class="button-row">
        <button type="button" class="button button--primary" onClick={() => void copy()}>
          Copy the message
        </button>
        <span role="status" class="copy-status">
          {copyState === 'copied' && 'Copied. Paste it into the chat you use, then come back here. Your code stays saved.'}
          {copyState === 'manual' && 'The browser did not allow copying. The message is selected: press Ctrl+C to copy it.'}
        </span>
      </div>
      <p class="quiet">
        When your code passes, the app asks whether you had outside help. Your answer is what decides between "passed with
        help" and "passed, reported independent".
      </p>
    </Dialog>
  )
}
