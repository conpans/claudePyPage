// Copies the Python runtime (Pyodide) from node_modules into public/pyodide so the app can
// load it from this computer. Nothing is fetched from the internet at run time.

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const source = join(projectRoot, 'node_modules', 'pyodide')
const target = join(projectRoot, 'public', 'pyodide')

// The files a browser needs when only the Python standard library is used.
const FILES = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']

if (!existsSync(join(source, 'package.json'))) {
  console.error('Pyodide is not installed yet. Run:  npm install')
  process.exit(1)
}

const version = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')).version
const stampPath = join(target, 'VERSION')
const upToDate =
  existsSync(stampPath) &&
  readFileSync(stampPath, 'utf8').trim() === version &&
  FILES.every((name) => existsSync(join(target, name)) && statSync(join(target, name)).size === statSync(join(source, name)).size)

if (!upToDate) {
  mkdirSync(target, { recursive: true })
  for (const name of FILES) copyFileSync(join(source, name), join(target, name))
  writeFileSync(stampPath, `${version}\n`)
  console.log(`Copied the Python runtime (Pyodide ${version}) into public/pyodide.`)
}
