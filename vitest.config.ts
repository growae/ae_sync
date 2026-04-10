import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@growae/aesync': resolve(
        __dirname,
        'packages/core/src/exports/index.ts',
      ),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      reporterOptions: {
        'json-summary': { file: 'coverage-summary.json' },
      },
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/index.ts',
        '**/exports/**',
        '**/*.d.ts',
      ],
    },
  },
})
