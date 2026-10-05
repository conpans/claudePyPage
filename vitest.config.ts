import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// The unit tests use the same Vite setup as the app, so they read the same content files
// through the same plugin. Tests that run real Python load Pyodide under Node, which takes
// a couple of seconds, hence the generous time limits.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
      testTimeout: 120_000,
      hookTimeout: 120_000,
    },
  }),
)
