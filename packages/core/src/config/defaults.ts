import type { DatabaseConfig } from './types.js'

export const DEFAULT_FINALITY_DEPTH = 20

export const DEFAULT_DATABASE: DatabaseConfig = {
  kind: 'pglite',
  directory: '.aesync/pglite',
}

export const DEFAULT_PORT = 42069
