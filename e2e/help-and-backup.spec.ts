// Getting help from outside the app, and keeping progress safe.

import { expect, test } from '@playwright/test'
import { RECORDS_TOO_EARLY, check, openItem, setCode, waitForPython } from './helpers.ts'

test('copy context for help holds the current code and result, and reaches the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openItem(page, 'running-totals')
  await waitForPython(page)
  await setCode(page, RECORDS_TOO_EARLY)
  await check(page)
  await expect(page.locator('.results-title')).toHaveText('0 of 6 tests passed')
  await page.getByRole('tab', { name: 'Hints' }).click()
  await page.getByRole('button', { name: 'Show hint 1 of 3' }).click()

  await page.getByRole('button', { name: 'Copy context for help' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Where are you stuck?').fill('My list is one step behind.')
  const preview = await dialog.getByLabel('The message that will be copied').inputValue()
  expect(preview).toContain('Title: Running totals')
  expect(preview).toContain('running_totals.append(total)\n    total = total + numbers[position]')
  expect(preview).toContain('0 of 6 tests passed')
  expect(preview).toContain('Expected running_totals: [3, 4, 8]')
  expect(preview).toContain('Actual running_totals: [0, 3, 4]')
  expect(preview).toContain('Hint 1 (I have read it)')
  expect(preview).not.toContain('Hint 2 (I have read it)')
  expect(preview).toContain('My list is one step behind.')
  expect(preview).toContain('I have not opened the worked solution')
  expect(preview).not.toContain('/home/')

  await dialog.getByRole('button', { name: 'Copy the message' }).click()
  await expect(dialog).toContainText('Copied.')
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toBe(preview)
})

test('a backup can be downloaded, a bad file is refused without harm, and a good one restores', async ({ page }) => {
  await openItem(page, 'running-totals')
  await waitForPython(page)
  await setCode(page, RECORDS_TOO_EARLY)
  await check(page)
  await expect(page.locator('.results-title')).toHaveText('0 of 6 tests passed')

  await page.goto('/#/progress')
  await expect(page.locator('.history')).toContainText('Running totals')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download a backup file' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^stepwise-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const path = await download.path()
  const { readFileSync } = await import('node:fs')
  const backup = readFileSync(path, 'utf8')
  expect(JSON.parse(backup)).toMatchObject({ format: 'stepwise-backup', version: 1 })

  // A damaged file is refused and nothing changes.
  await page.getByLabel('Choose a backup file to import').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"stepwise-backup","version":1,"state":{"version":1,"items":[]}}'),
  })
  await expect(page.locator('.trouble')).toContainText('was not imported. Nothing was changed.')
  await expect(page.locator('.history')).toContainText('Running totals')

  // Import the good backup into an empty browser profile and see the draft come back.
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator('.history')).toHaveCount(0)
  await page.getByLabel('Choose a backup file to import').setInputFiles({
    name: 'stepwise-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  })
  await expect(page.locator('.notice')).toContainText('is a valid backup')
  await page.getByRole('button', { name: 'Replace my progress with this backup' }).click()
  await expect(page.locator('.history')).toContainText('Running totals')
  await page.goto('/#/practice/running-totals')
  await expect(page.locator('.cm-content')).toContainText('running_totals.append(total)')

  // And the import can be undone.
  await page.goto('/#/progress')
  await page.getByRole('button', { name: 'Undo the last import' }).click()
  await expect(page.locator('.history')).toHaveCount(0)
})
