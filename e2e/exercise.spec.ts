// The core learning loop on a coding exercise: attempt, run, check, read feedback, step
// through, recover from a loop that never ends, pass, report, and come back later.

import { expect, test } from '@playwright/test'
import { CORRECT_RUNNING_TOTALS, NEVER_ENDS, RECORDS_TOO_EARLY, check, editorText, openItem, run, setCode, waitForPython } from './helpers.ts'

test('a wrong attempt gets expected-versus-actual and the prepared feedback, without the solution', async ({ page }) => {
  await openItem(page, 'running-totals')
  await waitForPython(page)
  await setCode(page, RECORDS_TOO_EARLY)

  await run(page)
  await expect(page.locator('.results-title')).toHaveText('The program ran to the end')
  await expect(page.locator('.results')).toContainText('running_totals')
  await expect(page.locator('.results')).toContainText('[0, 3, 4]')

  await check(page)
  await expect(page.locator('.results-title')).toHaveText('0 of 6 tests passed')
  const first = page.locator('.test').first()
  await expect(first).toContainText('three items')
  await expect(first).toContainText('[3, 4, 8]')
  await expect(first).toContainText('[0, 3, 4]')
  await expect(first).toContainText('The first difference is at position 0')
  await expect(first).toContainText('one step behind')
  // The worked solution stays hidden: its distinctive line never appears on the page.
  await expect(page.locator('body')).not.toContainText('running_totals.append(total)\n    position')
  await expect(page.locator('.item-actions .status')).toContainText('Attempted')
})

test('stepping through a failing test shows real values, positions apart from values', async ({ page }) => {
  await openItem(page, 'running-totals')
  await waitForPython(page)
  await setCode(page, RECORDS_TOO_EARLY)
  await check(page)
  await page.getByRole('button', { name: 'Step through this test' }).click()

  const stepper = page.locator('.stepper')
  await expect(stepper).toContainText('Your code, as Python really ran it')
  await expect(stepper).toContainText('Step 0 of')
  // The list strip: values in the boxes, positions underneath.
  await expect(stepper.locator('.strip-cell')).toHaveText(['3', '1', '4'])
  await expect(stepper.locator('.strip-position')).toHaveText(['0', '1', '2'])

  const next = page.getByRole('button', { name: 'Next' })
  for (let step = 0; step < 5; step += 1) await next.click()
  // After five executed lines the first append has run with total still 0.
  await expect(stepper).toContainText('Step 5 of')
  await expect(stepper).toContainText('running_totals')
  await expect(stepper.locator('.stepper-story')).toContainText('running_totals.append(total)')
  await expect(stepper.locator('.stepper-story')).toContainText('got one more item at the end')
  await expect(stepper.locator('.strip-pointer')).toContainText('position')

  // The keyboard works too.
  await stepper.locator('.stepper-controls').getByRole('button', { name: 'Back' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(stepper).toContainText('Step 6 of')
  await page.keyboard.press('ArrowLeft')
  await expect(stepper).toContainText('Step 5 of')
})

test('a loop that never ends is stopped, explained, and the next program runs normally', async ({ page }) => {
  await openItem(page, 'running-totals')
  await waitForPython(page)
  await setCode(page, NEVER_ENDS)
  await run(page)
  await expect(page.locator('.results-title')).toHaveText('The program did not finish', { timeout: 20_000 })
  await expect(page.locator('.trouble')).toContainText('still running after 4 seconds, so it was stopped')
  await expect(page.locator('.results')).toContainText('Variables at the moment it stopped')
  await expect(page.locator('.results')).toContainText('position')
  await expect(page.locator('.results')).toContainText('items in total')

  // Check runs the tests; the first one is stopped and the rest are not run.
  await check(page)
  await expect(page.locator('.results-title')).toHaveText('0 of 6 tests passed', { timeout: 20_000 })
  await expect(page.locator('.test').first()).toContainText('stopped')
  await expect(page.locator('.test').last()).toContainText('not run')

  // And Python is still fine afterwards.
  await setCode(page, CORRECT_RUNNING_TOTALS)
  await run(page)
  await expect(page.locator('.results-title')).toHaveText('The program ran to the end')
  await expect(page.locator('.results')).toContainText('[3, 4, 8]')
})

test('the Stop button interrupts a running program', async ({ page }) => {
  await openItem(page, 'running-totals')
  await waitForPython(page)
  await setCode(page, NEVER_ENDS)
  await run(page)
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.locator('.results-title')).toHaveText('The program did not finish')
  await expect(page.locator('.trouble')).toContainText('You stopped the program')
})

test('a correct program passes, the learner reports help, and the status is honest', async ({ page }) => {
  await openItem(page, 'running-totals')
  await waitForPython(page)
  await setCode(page, CORRECT_RUNNING_TOTALS)
  await page.keyboard.press('Control+Shift+Enter')
  await expect(page.locator('.results-title')).toHaveText('All 6 tests passed')
  await expect(page.locator('.pass')).toContainText('That works')
  await expect(page.locator('.item-actions .status')).toContainText('Passed, help not reported')

  await page.getByRole('radio', { name: 'No, I did this on my own' }).check()
  await expect(page.locator('.item-actions .status')).toContainText('Passed, reported independent')
  await page.getByRole('radio', { name: 'Yes, I had some help' }).check()
  await expect(page.locator('.item-actions .status')).toContainText('Passed with help')
  await expect(page.locator('.pass')).toContainText('Running products')
})

test('a pass after opening a hint is recorded as passed with help, whatever is reported', async ({ page }) => {
  await openItem(page, 'running-totals')
  await waitForPython(page)
  await page.getByRole('tab', { name: 'Hints' }).click()
  await page.getByRole('button', { name: 'Show hint 1 of 3' }).click()
  await expect(page.locator('.hints')).toContainText('Which two things change on every round')
  await page.getByRole('tab', { name: 'Task' }).click()
  await setCode(page, CORRECT_RUNNING_TOTALS)
  await check(page)
  await expect(page.locator('.results-title')).toHaveText('All 6 tests passed')
  await expect(page.locator('.pass')).toContainText('recorded as passed with help')
  await expect(page.getByRole('radio', { name: 'No, I did this on my own' })).toHaveCount(0)
  await expect(page.locator('.item-actions .status')).toContainText('Passed with help')
})

test('code and the last result survive a reload', async ({ page }) => {
  await openItem(page, 'running-totals')
  await waitForPython(page)
  await setCode(page, RECORDS_TOO_EARLY)
  await check(page)
  await expect(page.locator('.results-title')).toHaveText('0 of 6 tests passed')

  await page.reload()
  await expect(page.locator('.cm-content')).toContainText('running_totals.append(total)')
  expect((await editorText(page)).trim()).toBe(RECORDS_TOO_EARLY.trim())
  await expect(page.locator('.results--saved')).toContainText('Your last check, today: 0 of 6 tests passed')
  await expect(page.locator('.results--saved')).toContainText('three items')

  // And the home page offers to continue it, with the reason.
  await page.goto('/#/')
  await expect(page.locator('.resume')).toContainText('Running totals')
  await expect(page.locator('.resume')).toContainText('Your last check passed 0 of 6 tests')
})

test('the worked solution stays hidden until asked for, and then offers a fresh attempt', async ({ page }) => {
  await openItem(page, 'running-totals')
  await waitForPython(page)
  await page.getByRole('tab', { name: 'Worked solution' }).click()
  await expect(page.locator('.tab-panel')).toContainText('hidden until you ask for it')
  await page.getByRole('button', { name: 'I want to see the worked solution' }).click()
  await page.getByRole('button', { name: 'Show the worked solution' }).click()
  await expect(page.locator('.tab-panel')).toContainText('running_totals.append(total)')
  await expect(page.locator('.tab-panel')).toContainText('Try Running products next')

  await setCode(page, CORRECT_RUNNING_TOTALS)
  await check(page)
  await expect(page.locator('.item-actions .status')).toContainText('Passed with help')
  await page.getByRole('button', { name: 'Start a fresh attempt', exact: true }).click()
  expect((await editorText(page)).trim()).toBe('# numbers is given. Leave your answer in running_totals.')
  await expect(page.locator('.pass')).toHaveCount(0)

  await page.goto('/#/')
  await expect(page.locator('.suggestions')).toContainText('Try Running totals again from a blank start')
  await expect(page.locator('.suggestions')).toContainText('You opened the worked solution here today')
})

test('the given values can be changed for Run, and the tests still use their own', async ({ page }) => {
  await openItem(page, 'running-totals')
  await waitForPython(page)
  await page.getByLabel('Given values').fill('numbers = [10, 20]\n')
  await setCode(page, CORRECT_RUNNING_TOTALS)
  await run(page)
  await expect(page.locator('.results')).toContainText('[10, 30]')
  await check(page)
  await expect(page.locator('.results-title')).toHaveText('All 6 tests passed')
})
