// The frame around every page: the name, the three starting points, and a few utilities.

import { useEffect } from 'preact/hooks'
import { content } from './content/index.ts'
import { AboutPage } from './pages/AboutPage.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { ItemPage } from './pages/ItemPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { ProblemsPage } from './pages/ProblemsPage.tsx'
import { ProgressPage } from './pages/ProgressPage.tsx'
import { SkillPage } from './pages/SkillPage.tsx'
import { SkillsPage } from './pages/SkillsPage.tsx'
import { pythonRuntime } from './python/runtime.ts'
import { href, useRoute, type Route } from './router.ts'
import { store, useAppState } from './state/hooks.ts'
import type { ThemeChoice } from './state/progress.ts'
import { PythonStatus } from './ui/common.tsx'

function pageTitle(route: Route): string {
  switch (route.page) {
    case 'home':
      return 'Continue'
    case 'skills':
      return 'Practice a skill'
    case 'skill':
      return content.skill(route.id)?.title ?? 'Skill'
    case 'problems':
      return 'Browse problems'
    case 'practice':
      return content.item(route.id)?.title ?? 'Exercise'
    case 'progress':
      return 'Progress and backup'
    case 'about':
      return 'How this works'
    case 'not-found':
      return 'Not found'
  }
}

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Match my system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case 'home':
      return <HomePage />
    case 'skills':
      return <SkillsPage />
    case 'skill':
      return <SkillPage id={route.id} />
    case 'problems':
      return <ProblemsPage />
    case 'practice':
      return <ItemPage id={route.id} from={route.from} />
    case 'progress':
      return <ProgressPage />
    case 'about':
      return <AboutPage />
    case 'not-found':
      return <NotFoundPage what="page" />
  }
}

export function App() {
  const route = useRoute()
  const state = useAppState()
  const theme = state.session.theme
  const section = route.page === 'skill' ? 'skills' : route.page

  // Start loading Python straight away, so it is ready by the time code is run.
  useEffect(() => pythonRuntime().start(), [])

  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
  }, [theme])

  const title = pageTitle(route)
  const routeKey = route.page === 'practice' || route.page === 'skill' ? `${route.page}:${route.id}` : route.page
  useEffect(() => {
    document.title = `${title} - Stepwise`
    window.scrollTo(0, 0)
    // Move keyboard and screen-reader focus to the new page, as a full page load would.
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [routeKey, title])

  const link = (target: string, label: string, name: string) => (
    <a href={target} aria-current={section === name ? 'page' : undefined}>
      {label}
    </a>
  )

  return (
    <>
      <a class="skip-link" href="#main" onClick={(event) => {
        event.preventDefault()
        document.getElementById('main')?.focus()
      }}>
        Skip to the page content
      </a>
      <header class="site-head">
        <a class="brand" href={href.home()} aria-label="Stepwise, go to Continue">
          <span class="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span class="is-current" />
            <span />
          </span>
          <span class="brand-name">Stepwise</span>
        </a>
        <nav class="site-nav" aria-label="Main">
          {link(href.home(), 'Continue', 'home')}
          {link(href.skills(), 'Practice a skill', 'skills')}
          {link(href.problems(), 'Browse problems', 'problems')}
        </nav>
        <div class="site-tools">
          <PythonStatus />
          <nav aria-label="More">
            {link(href.progress(), 'Progress and backup', 'progress')}
            {link(href.about(), 'How this works', 'about')}
          </nav>
          <label class="theme-choice">
            <span class="visually-hidden">Color theme</span>
            <select value={theme} onChange={(event) => store.setTheme(event.currentTarget.value as ThemeChoice)}>
              {THEMES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      {store.saveError && (
        <p class="notice notice--banner" role="alert">
          {store.saveError}
        </p>
      )}
      <main id="main" tabIndex={-1}>
        <Page route={route} />
      </main>
    </>
  )
}
