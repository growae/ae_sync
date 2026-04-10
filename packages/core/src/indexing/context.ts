import type { SQL } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
import type { PgTable } from 'drizzle-orm/pg-core/table'
import type { Database } from '../database/types.js'
import type { HandlerContext, IndexingCache, IndexingDb } from './types.js'

export interface CreateHandlerContextParams {
  db: Database
  tables: Record<string, PgTable>
  cache: IndexingCache
  networkName: string
  height: number
  onRegister: (name: string, address: string) => void
}

export function createHandlerContext(
  params: CreateHandlerContextParams,
): HandlerContext {
  const { db, cache, networkName, height, onRegister } = params

  const indexingDb: IndexingDb = {
    insert(table: PgTable) {
      const config = getTableConfig(table)
      return {
        async values(
          data: Record<string, unknown> | Record<string, unknown>[],
        ) {
          const rows = Array.isArray(data) ? data : [data]
          for (const row of rows) {
            cache.insert(config.name, row)
          }
        },
      }
    },

    update(table: PgTable) {
      const config = getTableConfig(table)
      return {
        set(values: Record<string, unknown>) {
          return {
            async where(condition: SQL) {
              const key = extractWhereKey(condition)
              cache.update(config.name, key, values)
            },
          }
        },
      }
    },

    select() {
      return {
        from(table: PgTable) {
          return {
            async where(condition: SQL) {
              const rows = await db.qb.select().from(table).where(condition)
              return rows as Record<string, unknown>[]
            },
          }
        },
      }
    },

    delete(table: PgTable) {
      const config = getTableConfig(table)
      return {
        async where(condition: SQL) {
          const key = extractWhereKey(condition)
          cache.delete(config.name, key)
        },
      }
    },

    async execute(query: SQL) {
      return db.qb.execute(query)
    },
  }

  return {
    db: indexingDb,
    network: { name: networkName, height },
    contracts: { register: onRegister },
  }
}

/**
 * Best-effort extraction of equality conditions from a Drizzle SQL object.
 * This handles the common `eq(table.col, value)` pattern by inspecting
 * the query chunks. Falls back to an empty key for complex conditions.
 */
function extractWhereKey(condition: SQL): Record<string, unknown> {
  const key: Record<string, unknown> = {}

  try {
    const chunks = (condition as unknown as { queryChunks: unknown[] })
      .queryChunks
    if (!chunks) return key

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      if (
        chunk &&
        typeof chunk === 'object' &&
        'name' in chunk &&
        typeof (chunk as Record<string, unknown>).name === 'string'
      ) {
        const colName = (chunk as { name: string }).name
        const nextChunk = chunks[i + 1]
        if (
          nextChunk &&
          typeof nextChunk === 'object' &&
          'value' in nextChunk
        ) {
          const val = (nextChunk as { value: unknown }).value
          key[colName] = val
        }
      }
    }
  } catch {
    // Fall through with empty key for complex SQL
  }

  return key
}
