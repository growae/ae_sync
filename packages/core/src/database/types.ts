import type { PGlite } from '@electric-sql/pglite'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { PgTable } from 'drizzle-orm/pg-core/table'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import type { Pool } from 'pg'

export type DrizzleInstance = PgliteDatabase | NodePgDatabase

export interface Database {
  qb: DrizzleInstance
  migrate(tables: Record<string, PgTable>): Promise<void>
  transaction<T>(fn: (qb: DrizzleInstance) => Promise<T>): Promise<T>
  ping(): Promise<boolean>
  close(): Promise<void>
  raw: Pool | PGlite
}
