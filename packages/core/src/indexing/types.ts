import type { SQL } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core/table'
import type { DrizzleInstance } from '../database/types.js'
import type { HandlerEvent } from '../sync/types.js'

export interface HandlerContext {
  db: IndexingDb
  network: { name: string; height: number }
  contracts: { register: (name: string, address: string) => void }
}

export interface IndexingDb {
  insert(table: PgTable): {
    values(
      data: Record<string, unknown> | Record<string, unknown>[],
    ): Promise<void>
  }
  update(table: PgTable): {
    set(values: Record<string, unknown>): {
      where(condition: SQL): Promise<void>
    }
  }
  select(): {
    from(table: PgTable): {
      where(condition: SQL): Promise<Record<string, unknown>[]>
    }
  }
  delete(table: PgTable): {
    where(condition: SQL): Promise<void>
  }
  execute(query: SQL): Promise<unknown>
}

export type EventCallbackFn = (args: {
  event: HandlerEvent
  context: HandlerContext
}) => Promise<void>

export interface ProcessBatchResult {
  eventsProcessed: number
  duration: number
  registrations: Array<{ name: string; address: string }>
}

export interface IndexingCache {
  insertBuffer: Map<string, Record<string, unknown>[]>
  updateBuffer: Map<
    string,
    { key: Record<string, unknown>; set: Record<string, unknown> }[]
  >
  deleteBuffer: Map<string, Record<string, unknown>[]>
  insert(tableName: string, values: Record<string, unknown>): void
  update(
    tableName: string,
    key: Record<string, unknown>,
    set: Record<string, unknown>,
  ): void
  delete(tableName: string, where: Record<string, unknown>): void
  find(
    tableName: string,
    key: Record<string, unknown>,
  ): Record<string, unknown> | undefined
  flush(db: DrizzleInstance, tables: Record<string, PgTable>): Promise<void>
  clear(): void
  size(): number
}
