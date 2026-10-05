// The app at a narrow window (the "narrow" project in playwright.config.ts): one column,
// no sideways scrolling, and the exercise still works.

import { expect, test } from '@playwright/test'
import { CORRECT_RUNNING_TOTALS, openItem, setCode, waitForPython } from './helpers.ts'

async function noSidewaysScroll(page: import('@playwright/test').Page) {
  const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, window: window.innerWidth }))
  expect(widths.page).toBeLessThanOrEqual(widths.window)
}

test('pages fit a narrow window', async ({ page }) => {
  for (const hash of ['#/', '#/skills', '#/skills/accumulators', '#/problems', '#/progress', '#/about']) {
    await page.goto(`/${hash}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await noSidewaysScroll(page)
  }
})

test('an exercise works in one column', async ({ page }) => {
  await openItem(page, 'running-totals')
  await waitForPython(page)
  await noSidewaysScroll(page)
  const task = page.locator('.task-panel')
  const editor = page.locator('.code-workspace')
  const taskBox = await task.boundingBox()
  const editorBox = await editor.boundingBox()
  expect(taskBox && editorBox && editorBox.y >= taskBox.y + taskBox.height - 1).toBeTruthy()

  await setCode(page, CORRECT_RUNNING_TOTALS)
  await page.getByRole('button', { name: /^Check/ }).click()
  await expect(page.locator('.results-title')).toHaveText('All 6 tests passed')
  await page.getByRole('button', { name: 'Step through' }).click()
  await expect(page.locator('.stepper')).toContainText('Step 0 of')
  await noSidewaysScroll(page)
  await page.screenshot({ path: 'test-results/narrow-exercise.png', fullPage: true })
})
