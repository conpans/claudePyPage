// Shared steps for the browser tests. They drive the app the way a learner does: through
// the visible controls, by their accessible names.

import { expect, type Page } from '@playwright/test'

export const CORRECT_RUNNING_TOTALS = [
  'running_totals = []',
  'total = 0',
  'position = 0',
  'while position < len(numbers):',
  '    total = total + numbers[position]',
  '    running_totals.append(total)',
  '    position = position + 1',
  '',
].join('\n')

/** Records the total before adding: a wrong program the content recognises. */
export const RECORDS_TOO_EARLY = [
  'running_totals = []',
  'total = 0',
  'position = 0',
  'while position < len(numbers):',
  '    running_totals.append(total)',
  '    total = total + numbers[position]',
  '    position = position + 1',
  '',
].join('\n')

/** Never advances the position, so it never ends. */
export const NEVER_ENDS = [
  'running_totals = []',
  'total = 0',
  'position = 0',
  'while position < len(numbers):',
  '    total = total + numbers[position]',
  '    running_totals.append(total)',
  '',
].join('\n')

export async function openItem(page: Page, id: string, from?: string): Promise<void> {
  await page.goto(`/#/practice/${id}${from ? `?from=${from}` : ''}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

export async function waitForPython(page: Page): Promise<void> {
  await expect(page.getByRole('status').filter({ hasText: /Python .* ready/ })).toBeVisible({ timeout: 60_000 })
}

/** Replace the editor's content. */
export async function setCode(page: Page, code: string): Promise<void> {
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  await page.keyboard.insertText(code)
  await expect(editor).toContainText(code.trim().split('\n')[0] ?? '')
}

export async function editorText(page: Page): Promise<string> {
  return page.locator('.cm-content').innerText()
}

export async function run(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Run/ }).click()
}

export async function check(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Check/ }).click()
}

export async function resultsHeading(page: Page) {
  return page.locator('.results-title')
}
