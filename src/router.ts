// A small hash router. Hash addresses (#/skills/loops) work with any static file server and
// survive a reload, which is all this app needs.

import { useEffect, useState } from 'preact/hooks'

export type Route =
  | { page: 'home' }
  | { page: 'skills' }
  | { page: 'skill'; id: string }
  | { page: 'problems' }
  | { page: 'practice'; id: string; from: string | null }
  | { page: 'progress' }
  | { page: 'about' }
  | { page: 'not-found' }

export const href = {
  home: () => '#/',
  skills: () => '#/skills',
  skill: (id: string) => `#/skills/${encodeURIComponent(id)}`,
  problems: () => '#/problems',
  /** `from` records that the learner came here from another item, so the app can offer the way back. */
  practice: (id: string, from?: string | null) =>
    `#/practice/${encodeURIComponent(id)}${from ? `?from=${encodeURIComponent(from)}` : ''}`,
  progress: () => '#/progress',
  about: () => '#/about',
}

export function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  const [first, second] = parts
  if (first === undefined) return { page: 'home' }
  if (parts.length === 1) {
    if (first === 'skills') return { page: 'skills' }
    if (first === 'problems') return { page: 'problems' }
    if (first === 'progress') return { page: 'progress' }
    if (first === 'about') return { page: 'about' }
  }
  if (parts.length === 2 && second !== undefined) {
    if (first === 'skills') return { page: 'skill', id: second }
    if (first === 'practice') return { page: 'practice', id: second, from: new URLSearchParams(query).get('from') }
  }
  return { page: 'not-found' }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return route
}

export function navigate(to: string): void {
  window.location.hash = to.replace(/^#/, '')
}
