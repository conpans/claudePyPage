// The single store and Python runtime of the page, and hooks to read them from components.

import { useEffect, useState } from 'preact/hooks'
import { pythonRuntime, type RuntimeStatus } from '../python/runtime.ts'
import type { AppState } from './progress.ts'
import { AppStore, browserStorage } from './store.ts'

export const store = new AppStore(browserStorage())

// Another tab of the app may save progress; pick that up instead of overwriting it later.
window.addEventListener('storage', (event) => {
  if (event.key === null || event.key.startsWith('stepwise.v1.')) store.reload()
})

export function useAppState(): AppState {
  const [state, setState] = useState(() => store.getState())
  useEffect(() => store.subscribe(() => setState(store.getState())), [])
  return state
}

export function useRuntimeStatus(): RuntimeStatus {
  const runtime = pythonRuntime()
  const [status, setStatus] = useState(() => runtime.getStatus())
  useEffect(() => runtime.subscribe(setStatus), [runtime])
  return status
}
