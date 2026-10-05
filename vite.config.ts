import { defineConfig } from 'vite'
import { contentPlugin } from './build/content-plugin.ts'
import { APP_PORT, DEV_PORT, isolationHeaders, productionHeaders } from './build/headers.mjs'

export default defineConfig({
  plugins: [contentPlugin(import.meta.dirname)],
  // Relative asset paths, so the built app works from any folder a static server exposes.
  base: './',
  server: {
    host: '127.0.0.1',
    port: DEV_PORT,
    strictPort: true,
    headers: isolationHeaders,
  },
  preview: {
    host: '127.0.0.1',
    port: APP_PORT,
    strictPort: true,
    headers: productionHeaders,
  },
  build: {
    target: 'es2023',
    // CodeMirror is the bulk of the app's own code and is not worth splitting for a local app.
    chunkSizeWarningLimit: 1200,
  },
})
