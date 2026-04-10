import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    shims: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: { tsconfig: 'tsconfig.build.json' },
    shims: true,
  },
])
