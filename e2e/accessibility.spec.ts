// Automated accessibility checks (axe-core) on the main pages, in both themes.
// They catch missing names, wrong roles and low-contrast text. They do not replace using
// the app with a keyboard or a screen reader, which the keyboard test covers in part.

import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { RECORDS_TOO_EARLY, check, openItem, setCode, waitForPython } from './helpers.ts'

const PAGES = ['#/', '#/skills', '#/skills/accumulators', '#/problems', '#/progress', '#/about']

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme })

    test('the main pages have no serious accessibility violations', async ({ page }) => {
      const problems: string[] = []
      for (const hash of PAGES) {
        await page.goto(`/${hash}`)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
        for (const violation of results.violations) {
          if (violation.impact !== 'serious' && violation.impact !== 'critical') continue
          problems.push(`${hash}: ${violation.id} (${violation.impact}) ${violation.nodes.map((node) => node.target.join(' ')).slice(0, 3).join('; ')}`)
        }
      }
      expect(problems).toEqual([])
    })

    test('an exercise with results and a step-through has no serious accessibility violations', async ({ page }) => {
      await openItem(page, 'running-totals')
      await waitForPython(page)
      await setCode(page, RECORDS_TOO_EARLY)
      await check(page)
      await expect(page.locator('.results-title')).toHaveText('0 of 6 tests passed')
      await page.getByRole('button', { name: 'Step through this test' }).click()
      await expect(page.locator('.stepper')).toContainText('Step 0 of')
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        // The editor's own text layer is CodeMirror's; it is checked by that project.
        .exclude('.cm-editor')
        .analyze()
      const serious = results.violations
        .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
        .map((violation) => `${violation.id} (${violation.impact}) ${violation.nodes.map((node) => node.target.join(' ')).slice(0, 3).join('; ')}`)
      expect(serious).toEqual([])
    })
  })
}
