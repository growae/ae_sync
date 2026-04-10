import { sql } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
import type { PgTable } from 'drizzle-orm/pg-core/table'
import type { IndexingCache } from './types.js'

function escapeValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`
  return `'${String(v).replace(/'/g, "''")}'`
}

function findTable(
  tables: Record<string, PgTable>,
  tableName: string,
): PgTable | undefined {
  for (const table of Object.values(tables)) {
    const config = getTableConfig(table)
    if (config.name === tableName) return table
  }
  return undefined
}

export function createIndexingCache(): IndexingCache {
  const insertBuffer = new Map<string, Record<string, unknown>[]>()
  const updateBuffer = new Map<
    string,
    { key: Record<string, unknown>; set: Record<string, unknown> }[]
  >()
  const deleteBuffer = new Map<string, Record<string, unknown>[]>()

  return {
    insertBuffer,
    updateBuffer,
    deleteBuffer,

    insert(tableName, values) {
      let buf = insertBuffer.get(tableName)
      if (!buf) {
        buf = []
        insertBuffer.set(tableName, buf)
      }
      buf.push(values)
    },

    update(tableName, key, set) {
      let buf = updateBuffer.get(tableName)
      if (!buf) {
        buf = []
        updateBuffer.set(tableName, buf)
      }
      buf.push({ key, set })
    },

    delete(tableName, where) {
      let buf = deleteBuffer.get(tableName)
      if (!buf) {
        buf = []
        deleteBuffer.set(tableName, buf)
      }
      buf.push(where)
    },

    find(tableName, key) {
      const updates = updateBuffer.get(tableName)
      if (updates) {
        for (let i = updates.length - 1; i >= 0; i--) {
          const entry = updates[i]!
          if (keysMatch(entry.key, key)) {
            return { ...entry.key, ...entry.set }
          }
        }
      }

      const inserts = insertBuffer.get(tableName)
      if (inserts) {
        for (let i = inserts.length - 1; i >= 0; i--) {
          const row = inserts[i]!
          if (keysMatch(key, row)) {
            return row
          }
        }
      }

      return undefined
    },

    async flush(db, tables) {
      for (const [tableName, rows] of insertBuffer) {
        if (rows.length === 0) continue
        const table = findTable(tables, tableName)
        if (!table) continue

        const config = getTableConfig(table)
        const colNames = config.columns.map((c) => c.name)
        const colList = colNames.map((c) => `"${c}"`).join(', ')

        const valueRows = rows.map((row) => {
          const vals = colNames.map((col) => escapeValue(row[col])).join(', ')
          return `(${vals})`
        })

        const pkCols = getPrimaryKeyColumns(config)

        if (pkCols.length > 0) {
          const conflictCols = pkCols.map((c) => `"${c}"`).join(', ')
          const updateCols = colNames
            .filter((c) => !pkCols.includes(c))
            .map((c) => `"${c}" = EXCLUDED."${c}"`)
            .join(', ')

          const upsertSql =
            updateCols.length > 0
              ? `INSERT INTO "${tableName}" (${colList}) VALUES ${valueRows.join(', ')} ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateCols}`
              : `INSERT INTO "${tableName}" (${colList}) VALUES ${valueRows.join(', ')} ON CONFLICT (${conflictCols}) DO NOTHING`

          await db.execute(sql.raw(upsertSql))
        } else {
          await db.execute(
            sql.raw(
              `INSERT INTO "${tableName}" (${colList}) VALUES ${valueRows.join(', ')}`,
            ),
          )
        }
      }

      for (const [tableName, updates] of updateBuffer) {
        if (updates.length === 0) continue

        for (const { key, set } of updates) {
          const setClauses = Object.entries(set)
            .map(([k, v]) => `"${k}" = ${escapeValue(v)}`)
            .join(', ')
          const whereClauses = Object.entries(key)
            .map(([k, v]) => `"${k}" = ${escapeValue(v)}`)
            .join(' AND ')

          if (setClauses) {
            await db.execute(
              sql.raw(
                `UPDATE "${tableName}" SET ${setClauses} WHERE ${whereClauses}`,
              ),
            )
          }
        }
      }

      for (const [tableName, deletes] of deleteBuffer) {
        if (deletes.length === 0) continue

        for (const where of deletes) {
          const whereClauses = Object.entries(where)
            .map(([k, v]) => `"${k}" = ${escapeValue(v)}`)
            .join(' AND ')

          await db.execute(
            sql.raw(`DELETE FROM "${tableName}" WHERE ${whereClauses}`),
          )
        }
      }
    },

    clear() {
      insertBuffer.clear()
      updateBuffer.clear()
      deleteBuffer.clear()
    },

    size() {
      let count = 0
      for (const rows of insertBuffer.values()) count += rows.length
      for (const rows of updateBuffer.values()) count += rows.length
      for (const rows of deleteBuffer.values()) count += rows.length
      return count
    },
  }
}

function keysMatch(
  key: Record<string, unknown>,
  row: Record<string, unknown>,
): boolean {
  for (const [k, v] of Object.entries(key)) {
    if (row[k] !== v) return false
  }
  return true
}

function getPrimaryKeyColumns(
  config: ReturnType<typeof getTableConfig>,
): string[] {
  const pkCols: string[] = []
  for (const col of config.columns) {
    if (col.primary) pkCols.push(col.name)
  }
  if (pkCols.length === 0 && config.primaryKeys.length > 0) {
    for (const pk of config.primaryKeys) {
      for (const col of pk.columns) {
        pkCols.push(col.name)
      }
    }
  }
  return pkCols
}
