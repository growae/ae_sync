import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool, type PoolConfig } from 'pg'
import { applyMigrations } from './migrate.js'
import type { Database } from './types.js'

export async function createPostgresDatabase(
  connectionString: string,
  poolConfig?: PoolConfig,
): Promise<Database> {
  const pool = new Pool({ connectionString, ...poolConfig })
  const qb = drizzle(pool)

  return {
    qb,
    raw: pool,

    async migrate(tables) {
      await applyMigrations(qb, tables)
    },

    async transaction(fn) {
      return qb.transaction(async (tx) => fn(tx))
    },

    async ping() {
      try {
        const client = await pool.connect()
        try {
          await client.query('SELECT 1')
          return true
        } finally {
          client.release()
        }
      } catch {
        return false
      }
    },

    async close() {
      await pool.end()
    },
  }
}
