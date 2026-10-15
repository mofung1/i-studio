import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    coverage: {
      reportsDirectory: fileURLToPath(new URL('../test/artifacts/coverage/web', import.meta.url)),
    },
  },
})
