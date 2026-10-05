// `npm start`: build the app if it is missing or out of date, then serve it on localhost.

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

/** Newest modification time (ms) of any file under `path`, or 0 when it does not exist. */
function newestChange(path) {
  if (!existsSync(path)) return 0
  const info = statSync(path)
  if (!info.isDirectory()) return info.mtimeMs
  let newest = 0
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'pyodide') continue
    newest = Math.max(newest, newestChange(join(path, entry.name)))
  }
  return newest
}

if (!existsSync(join(projectRoot, 'node_modules', 'vite'))) {
  console.error('The app is not set up yet. Run this once, then try again:')
  console.error('  npm run setup')
  process.exit(1)
}

const builtAt = newestChange(join(projectRoot, 'dist', 'index.html'))
const inputs = ['src', 'content', 'build', 'public', 'index.html', 'package.json', 'vite.config.ts']
const changedAt = Math.max(...inputs.map((name) => newestChange(join(projectRoot, name))))

if (builtAt === 0 || changedAt > builtAt) {
  console.log(builtAt === 0 ? 'Building the app (first run)…' : 'Something changed since the last build. Rebuilding…')
  const build = spawnSync('npm', ['run', 'build', '--silent'], { cwd: projectRoot, stdio: 'inherit' })
  if (build.status !== 0) {
    console.error('The build failed, so the app was not started. The messages above say what went wrong.')
    process.exit(build.status ?? 1)
  }
}

const { main } = await import('../server.mjs')
await main(process.argv.slice(2))
