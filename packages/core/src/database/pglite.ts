import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { applyMigrations } from './migrate.js'
import type { Database } from './types.js'

const DEFAULT_DIR = '.ae-sync/pglite'

export async function createPGliteDatabase(
  directory?: string,
): Promise<Database> {
  const client = new PGlite(directory ?? DEFAULT_DIR)
  await client.waitReady
  const qb = drizzle(client)

  return {
    qb,
    raw: client,

    async migrate(tables) {
      await applyMigrations(qb, tables)
    },

    async transaction(fn) {
      return qb.transaction(async (tx) => fn(tx))
    },

    async ping() {
      try {
        await client.query('SELECT 1')
        return true
      } catch {
        return false
      }
    },

    async close() {
      await client.close()
    },
  }
}
