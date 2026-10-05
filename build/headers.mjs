// Ports and response headers shared by the dev server (vite.config.ts) and the app server (server.mjs).

/** The address learners use. Progress is stored by the browser per address, so this must stay fixed. */
export const APP_PORT = 4477
/** A separate address for development, so experiments never touch real progress. */
export const DEV_PORT = 4478
/** A separate address for the automated browser tests. */
export const TEST_PORT = 4479

/**
 * Cross-origin isolation. It lets the page share a small buffer with the Python worker,
 * which is how Stop (and the time limit) can interrupt a running program.
 */
export const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

/** The built app may only load code from, and talk to, the address it was served from. */
export const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

export const productionHeaders = {
  ...isolationHeaders,
  'Content-Security-Policy': contentSecurityPolicy,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
}
