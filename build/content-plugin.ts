// Vite plugin: makes the YAML files under content/ available to the app as one module,
// `virtual:stepwise-content`. The files are read and checked when the app is built (and
// whenever one changes during development), so a mistake in a content file stops the build
// with a message that names the file and the field.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { parse } from 'yaml'
import { buildContent, type RawFile } from '../src/content/validate.ts'

const VIRTUAL_ID = 'virtual:stepwise-content'
const RESOLVED_ID = '\0' + VIRTUAL_ID

function yamlFiles(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory)
    .filter((name) => name.endsWith('.yaml') && !name.startsWith('_'))
    .sort()
    .map((name) => join(directory, name))
}

export function readContent(contentRoot: string) {
  const errors: string[] = []
  const load = (directory: string): RawFile[] =>
    yamlFiles(directory).flatMap((path) => {
      const file = relative(resolve(contentRoot, '..'), path)
      try {
        return [{ file, data: parse(readFileSync(path, 'utf8')) as unknown }]
      } catch (error) {
        errors.push(`${file}: this file is not valid YAML: ${error instanceof Error ? error.message : String(error)}`)
        return []
      }
    })
  const result = buildContent(load(join(contentRoot, 'skills')), load(join(contentRoot, 'items')))
  return { content: result.content, errors: [...errors, ...result.errors], referenceErrors: result.referenceErrors }
}

export function contentPlugin(projectRoot: string): Plugin {
  const contentRoot = resolve(projectRoot, 'content')
  return {
    name: 'stepwise-content',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null
    },
    load(id) {
      if (id !== RESOLVED_ID) return null
      for (const directory of ['skills', 'items']) {
        for (const path of yamlFiles(join(contentRoot, directory))) this.addWatchFile(path)
      }
      const { content, errors, referenceErrors } = readContent(contentRoot)
      const problems = [...errors, ...referenceErrors]
      if (problems.length > 0) {
        const report = `The content has ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`
        // While content is still being written, STEPWISE_DRAFT_CONTENT=1 lets the app start with
        // whatever is valid so far. A normal build refuses to ship content with problems.
        if (process.env.STEPWISE_DRAFT_CONTENT === '1') this.warn(report)
        else this.error(report)
      }
      return `export default ${JSON.stringify(content)}`
    },
    configureServer(server) {
      // A new or deleted content file changes the collection, so reload the page.
      server.watcher.add(contentRoot)
      const refresh = (path: string) => {
        if (!path.startsWith(contentRoot)) return
        const module = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (module) server.moduleGraph.invalidateModule(module)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', refresh)
      server.watcher.on('unlink', refresh)
      server.watcher.on('change', refresh)
    },
  }
}
