// Prediction exercises, working with no outside network, and keyboard-only use.

import { expect, test } from '@playwright/test'
import { CORRECT_RUNNING_TOTALS, openItem, setCode, waitForPython } from './helpers.ts'

test('a prediction is checked by really running the program, with feedback for a known wrong answer', async ({ page }) => {
  await openItem(page, 'accumulators-replace-or-add')
  await waitForPython(page)
  const output = page.getByLabel(/What does the program print/)
  const position = page.getByLabel(/What is the value of/)
  await output.fill('15\n15')
  await position.fill('2')
  await page.getByRole('button', { name: 'Check my answers' }).click()
  await expect(page.locator('.question').first()).toContainText('not what the program does')
  await expect(page.locator('.question').first()).toContainText('does not build on the old value')
  await expect(page.locator('.question').last()).toContainText('still runs and makes it 3')
  // The true values are not given away.
  await expect(page.locator('.question').first()).not.toContainText('5\n15')

  await output.fill('5\n15')
  await position.fill('3')
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('.question').first()).toContainText('That is what Python does')
  await expect(page.locator('.pass')).toContainText('Your predictions match')
  await expect(page.locator('.item-actions .status')).toContainText('Passed, help not reported')

  await page.getByRole('button', { name: 'Step through the program' }).click()
  await expect(page.locator('.stepper')).toContainText('Step 0 of')
})

test('core practice makes no request outside this computer', async ({ page }) => {
  const outside: string[] = []
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname
    if (host === 'localhost' || host === '127.0.0.1') return route.continue()
    outside.push(route.request().url())
    return route.abort()
  })
  await openItem(page, 'running-totals')
  await waitForPython(page)
  expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(true)
  await setCode(page, CORRECT_RUNNING_TOTALS)
  await page.getByRole('button', { name: /^Check/ }).click()
  await expect(page.locator('.results-title')).toHaveText('All 6 tests passed')
  await page.goto('/#/skills/accumulators')
  await expect(page.locator('.stepper').first().getByRole('button', { name: 'Next' })).toBeEnabled({ timeout: 60_000 })
  expect(outside).toEqual([])
  const response = await page.request.get('/')
  expect(response.headers()['content-security-policy']).toContain("connect-src 'self'")
})

test('the exercise can be worked with the keyboard alone', async ({ page }) => {
  await openItem(page, 'running-totals')
  await waitForPython(page)

  // Tabs: arrow keys move between them.
  await page.getByRole('tab', { name: 'Task' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Hints' })).toBeFocused()
  await expect(page.getByRole('tab', { name: 'Hints' })).toHaveAttribute('aria-selected', 'true')

  // Into the editor, type, and run with Ctrl+Enter.
  await page.locator('.cm-content').focus()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  await page.keyboard.insertText(CORRECT_RUNNING_TOTALS)
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('.results-title')).toHaveText('The program ran to the end')

  // Tab indents inside the editor; Escape then Tab leaves it.
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Tab')
  await expect(page.locator('.cm-content')).toContainText('    ')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Tab')
  await expect(page.locator('.cm-content')).not.toBeFocused()
  const focused = await page.evaluate(() => document.activeElement?.tagName)
  expect(['BUTTON', 'A', 'TEXTAREA', 'INPUT']).toContain(focused)

  // Check from outside the editor with the shortcut.
  await page.keyboard.press('Control+Shift+Enter')
  await expect(page.locator('.results-title')).toContainText('tests passed')
})
