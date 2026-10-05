#!/usr/bin/env node
// Serves the built app (dist/) on this computer only.
// It hands out static files and nothing else: no API, no file writes, no code execution.
// Learner code runs inside the browser's sandbox, never through this server.

import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_PORT, productionHeaders } from './build/headers.mjs'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

function fileInfo(path) {
  try {
    return statSync(path)
  } catch {
    return null
  }
}

function createHandler(root, port) {
  const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`])

  return (request, response) => {
    const sendText = (status, text, extra = {}) => {
      response.writeHead(status, {
        ...productionHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        ...extra,
      })
      response.end(request.method === 'HEAD' ? undefined : text)
    }

    if (!allowedHosts.has(request.headers.host ?? '')) {
      sendText(421, 'This app only answers on localhost.\n')
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendText(405, 'This server only serves files.\n', { Allow: 'GET, HEAD' })
      return
    }

    let pathname
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    } catch {
      sendText(400, 'That address could not be read.\n')
      return
    }
    if (pathname.includes('\0')) {
      sendText(400, 'That address could not be read.\n')
      return
    }

    let filePath = resolve(root, '.' + normalize('/' + pathname))
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      sendText(403, 'Not available.\n')
      return
    }
    let info = fileInfo(filePath)
    if (info?.isDirectory()) {
      filePath = join(filePath, 'index.html')
      info = fileInfo(filePath)
    }
    if (!info?.isFile()) {
      sendText(404, 'Not found.\n')
      return
    }

    // Files under /assets/ have a content hash in their name, so they can be cached for good.
    // Everything else is revalidated on each load, which is instant on localhost.
    const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`
    const headers = {
      ...productionHeaders,
      'Content-Type': CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      ETag: etag,
    }
    if (request.headers['if-none-match'] === etag) {
      response.writeHead(304, headers)
      response.end()
      return
    }
    response.writeHead(200, { ...headers, 'Content-Length': info.size })
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    const stream = createReadStream(filePath)
    stream.on('error', () => response.destroy())
    stream.pipe(response)
  }
}

/**
 * Start serving `root` on 127.0.0.1:`port`. Resolves once the server is listening.
 * @param {{ port?: number, root?: string }} [options]
 */
export function startServer(options = {}) {
  const port = options.port ?? APP_PORT
  const root = resolve(options.root ?? join(projectRoot, 'dist'))
  const server = createServer(createHandler(root, port))
  return new Promise((resolveStart, rejectStart) => {
    server.once('error', rejectStart)
    // 127.0.0.1 is the loopback interface: reachable from this computer only.
    server.listen(port, '127.0.0.1', () => resolveStart(server))
  })
}

function readPort(argv) {
  const flag = argv.indexOf('--port')
  if (flag === -1) return APP_PORT
  const value = Number(argv[flag + 1])
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('--port needs a number between 1 and 65535.')
  }
  return value
}

export async function main(argv = process.argv.slice(2)) {
  const port = readPort(argv)
  const root = join(projectRoot, 'dist')
  if (!fileInfo(join(root, 'index.html'))?.isFile()) {
    console.error('The app has not been built yet. Run:  npm run build')
    process.exitCode = 1
    return
  }
  try {
    await startServer({ port, root })
  } catch (error) {
    if (error && error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use.`)
      console.error('Stepwise may already be running in another terminal. If so, just open:')
      console.error(`  http://localhost:${port}`)
    } else {
      console.error(`The server could not start: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exitCode = 1
    return
  }
  console.log('')
  console.log('  Stepwise is running.')
  console.log(`  Open   http://localhost:${port}   in your browser.`)
  console.log('  Stop   with Ctrl+C in this terminal.')
  console.log('')
  if (port !== APP_PORT) {
    console.log(`  Note: your saved progress belongs to http://localhost:${APP_PORT}.`)
    console.log('  A different port is a different address, so the browser keeps separate progress for it.')
    console.log('')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
