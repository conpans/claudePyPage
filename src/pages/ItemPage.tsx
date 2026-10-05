// One exercise: the task and its help on the left, the working area on the right.

import { useEffect, useMemo, useState } from 'preact/hooks'
import { content } from '../content/index.ts'
import { givenSource } from '../content/python-literal.ts'
import { isCodeItem } from '../content/schema.ts'
import { href } from '../router.ts'
import { store, useAppState } from '../state/hooks.ts'
import { currentAttempt, itemStatus } from '../state/progress.ts'
import { ItemMeta, StatusBadge } from '../ui/common.tsx'
import { CodeWorkspace } from '../workspace/CodeWorkspace.tsx'
import { ContextDialog } from '../workspace/ContextDialog.tsx'
import { PredictWorkspace } from '../workspace/PredictWorkspace.tsx'
import { TaskPanel } from '../workspace/TaskPanel.tsx'
import { NotFoundPage } from './NotFoundPage.tsx'

export function ItemPage({ id, from }: { id: string; from: string | null }) {
  const state = useAppState()
  const item = content.item(id)
  const [generation, setGeneration] = useState(0)
  const [contextOpen, setContextOpen] = useState(false)

  useEffect(() => {
    if (!content.item(id)) return
    store.visit(id, from !== null && content.item(from) ? from : null)
    setGeneration(0)
    setContextOpen(false)
  }, [id, from])

  const origins = useMemo(
    () => content.list(state.session.returnTo.filter((entry) => entry.to === id).map((entry) => entry.from)),
    [state.session.returnTo, id],
  )

  if (!item) return <NotFoundPage what="exercise" />

  const draft = state.drafts[item.id]
  const code = isCodeItem(item) ? (draft?.code ?? item.starter) : ''
  const given = isCodeItem(item) ? (draft?.given ?? givenSource(item.exampleGiven)) : ''
  const answers = item.format === 'predict' ? item.questions.map((_, index) => draft?.answers?.[index] ?? '') : []
  const skill = item.skill ? content.skill(item.skill) : undefined

  const freshAttempt = () => {
    store.startFreshAttempt(item.id, isCodeItem(item) ? item.starter : '')
    setGeneration((value) => value + 1)
  }

  return (
    <div class="page page--wide">
      <nav class="crumbs" aria-label="Where this is">
        {skill ? (
          <>
            <a href={href.skills()}>Skills</a>
            <span aria-hidden="true">/</span>
            <a href={href.skill(skill.id)}>{skill.shortTitle}</a>
          </>
        ) : (
          <a href={href.problems()}>Problems</a>
        )}
      </nav>

      <header class="item-head">
        <div>
          <h1>{item.title}</h1>
          <p class="item-meta">
            <ItemMeta item={item} />
          </p>
        </div>
        <div class="item-actions">
          <StatusBadge status={itemStatus(state.items[item.id])} />
          <button type="button" class="button" onClick={() => setContextOpen(true)}>
            Copy context for help
          </button>
        </div>
      </header>

      {origins.map((origin) => (
        <div key={origin.id} class="return-banner" role="note">
          <span>
            You came here from <strong>{origin.title}</strong>. Your code there is saved.
          </span>
          <a class="button" href={href.practice(origin.id)} onClick={() => store.clearReturn(item.id)}>
            Return to {origin.title}
          </a>
          <button type="button" class="button button--quiet" onClick={() => store.clearReturn(item.id)}>
            Dismiss
          </button>
        </div>
      ))}

      <div class="workspace">
        <TaskPanel key={item.id} item={item} state={state} onFreshAttempt={freshAttempt} />
        {isCodeItem(item) ? (
          <CodeWorkspace key={`${item.id}-${generation}`} item={item} state={state} onFreshAttempt={freshAttempt} />
        ) : (
          <PredictWorkspace key={`${item.id}-${generation}`} item={item} state={state} onFreshAttempt={freshAttempt} />
        )}
      </div>

      <ContextDialog
        open={contextOpen}
        onClose={() => setContextOpen(false)}
        item={item}
        code={code}
        given={given}
        answers={answers}
        attempt={currentAttempt(state.items[item.id])}
      />
    </div>
  )
}
