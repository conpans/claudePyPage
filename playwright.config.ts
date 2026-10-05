import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { TEST_PORT } from './build/headers.mjs'

// Browser tests run against the built app, served by the app's own server on a separate
// port, so they exercise what a learner gets (including the security headers).
// Build first: `npm run build`. One-time browser setup: `npm run e2e:setup`.

// On a machine without Chromium's system libraries, scripts/setup-e2e.sh unpacks them here.
const localLibraries = join(import.meta.dirname, '.local', 'chromium-libs')
const environment: Record<string, string> = {}
for (const [name, value] of Object.entries(process.env)) {
  if (value !== undefined) environment[name] = value
}
if (existsSync(localLibraries)) {
  environment.LD_LIBRARY_PATH = [localLibraries, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')
}

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: `http://localhost:${TEST_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { env: environment },
  },
  projects: [
    // Every spec runs at a normal desktop size, except those written for the narrow layout.
    { name: 'desktop', use: desktop, testIgnore: /narrow.*\.spec\.ts$/ },
    // Specs with "narrow" in their file name run in a narrow window instead.
    { name: 'narrow', use: { ...desktop, viewport: { width: 760, height: 900 } }, testMatch: /narrow.*\.spec\.ts$/ },
  ],
  webServer: {
    command: `node server.mjs --port ${TEST_PORT}`,
    url: `http://localhost:${TEST_PORT}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
