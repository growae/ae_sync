import type { DatabaseConfig } from '../config/types.js'
import { createPGliteDatabase } from './pglite.js'
import { createPostgresDatabase } from './postgres.js'
import type { Database } from './types.js'

export async function createDatabase(
  config: DatabaseConfig,
): Promise<Database> {
  switch (config.kind) {
    case 'pglite':
      return createPGliteDatabase(config.directory)
    case 'postgres': {
      if (!config.connectionString) {
        throw new Error(
          'database.connectionString is required for kind "postgres"',
        )
      }
      return createPostgresDatabase(config.connectionString, config.poolConfig)
    }
    default:
      throw new Error(
        `Unknown database kind: ${String((config as DatabaseConfig).kind)}`,
      )
  }
}

export { createPGliteDatabase } from './pglite.js'
export { createPostgresDatabase } from './postgres.js'
export { applyMigrations } from './migrate.js'
export {
  createShadowTables,
  revertToHeight,
  pruneFinalized,
} from './shadow.js'
export type { Database, DrizzleInstance } from './types.js'
