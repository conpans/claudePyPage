// Skills and problems are connected: warm-ups, the way back, skill pages with real traces.

import { expect, test } from '@playwright/test'
import { RECORDS_TOO_EARLY, editorText, openItem, setCode, waitForPython } from './helpers.ts'

test('a warm-up opened from a challenge offers the way back, and the code is still there', async ({ page }) => {
  await openItem(page, 'running-totals')
  await waitForPython(page)
  await setCode(page, RECORDS_TOO_EARLY)

  await page.getByRole('tab', { name: 'Task' }).click()
  await page.getByRole('link', { name: 'Add up a list' }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Add up a list')
  await expect(page.locator('.return-banner')).toContainText('You came here from Running totals')

  await page.getByRole('link', { name: 'Return to Running totals' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Running totals')
  expect((await editorText(page)).trim()).toBe(RECORDS_TOO_EARLY.trim())
  await expect(page.locator('.return-banner')).toHaveCount(0)
})

test('skill pages list exercises and problems, and problems link back to skills', async ({ page }) => {
  await page.goto('/#/skills')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Practice a skill')
  const units = page.locator('.skill-card')
  await expect(units).toHaveCount(6)
  await expect(page.locator('.skill-map')).toContainText('Running totals')

  await page.getByRole('link', { name: 'Accumulators for sums, products, and counts' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Accumulators for sums, products, and counts')
  await expect(page.locator('.exercise-list').first().locator('li')).toHaveCount(4)
  await expect(page.locator('.unit-practice')).toContainText('Running totals')

  await page.getByRole('link', { name: 'Running totals' }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Running totals')
  await expect(page.locator('.link-list--inline')).toContainText('Accumulators')
})

test('a prepared step-through example shows states produced by real Python', async ({ page }) => {
  await page.goto('/#/skills/accumulators')
  const stepper = page.locator('.stepper').first()
  await expect(stepper.getByRole('button', { name: 'Next' })).toBeEnabled({ timeout: 60_000 })
  await expect(stepper).toContainText('Prepared example')
  await expect(stepper.locator('.strip-cell')).toHaveText(['3', '1', '4'])

  // total goes 0, 3, 4, 8 as the loop adds each item: the values Python produced.
  const totals: string[] = []
  const next = stepper.getByRole('button', { name: 'Next' })
  for (let step = 0; step < 14; step += 1) {
    if (await next.isDisabled()) break
    await next.click()
    const row = stepper.locator('.value-table tr', { hasText: 'total' })
    if ((await row.count()) > 0) totals.push((await row.locator('td code').first().innerText()).trim())
  }
  const distinct = totals.filter((value, index) => index === 0 || totals[index - 1] !== value)
  expect(distinct).toEqual(['0', '3', '4', '8'])
  await expect(stepper).toContainText('The program has finished')
  await expect(stepper.locator('.stepper-output')).toContainText('Total: 8')
})

test('browsing problems can be filtered', async ({ page }) => {
  await page.goto('/#/problems')
  await expect(page.locator('.problem-table tbody tr').first()).toBeVisible()
  const before = await page.locator('.problem-table tbody tr').count()
  await page.getByLabel('Source').selectOption('leetcode-adaptation')
  const rows = page.locator('.problem-table tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('LeetCode')
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.locator('.problem-table tbody tr')).toHaveCount(before)
  await page.getByLabel('Show').selectOption('all')
  expect(await page.locator('.problem-table tbody tr').count()).toBeGreaterThan(before)
})
