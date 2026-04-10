import type {
  BuildColumns,
  BuildExtraConfigColumns,
} from 'drizzle-orm/column-builder'
import type { PgColumnsBuilders } from 'drizzle-orm/pg-core/columns/all'
import type { PgColumnBuilderBase } from 'drizzle-orm/pg-core/columns/common'
import type {
  PgTableExtraConfigValue,
  PgTableWithColumns,
} from 'drizzle-orm/pg-core/table'
import { pgTable } from 'drizzle-orm/pg-core/table'
import { ONCHAIN_TABLE_MARKER, type OnchainTable } from './types.js'

export {
  text,
  integer,
  bigint,
  boolean,
  real,
  doublePrecision,
  timestamp,
  json,
  jsonb,
  serial,
  varchar,
  numeric,
} from 'drizzle-orm/pg-core/columns'

export { index, uniqueIndex } from 'drizzle-orm/pg-core/indexes'
export { primaryKey } from 'drizzle-orm/pg-core/primary-keys'

/**
 * Branded wrapper around Drizzle's `pgTable`.
 *
 * Creates a table definition tagged with the aesync onchain marker so the
 * framework can distinguish user-defined indexing tables from arbitrary
 * Drizzle tables at runtime.
 *
 * Accepts the same overloads as `pgTable`:
 * - Object-style columns
 * - Callback-style columns `(t) => ({ ... })`
 * - Optional extra config (indexes, etc.)
 */
export function onchainTable<
  TTableName extends string,
  TColumnsMap extends Record<string, PgColumnBuilderBase>,
>(
  name: TTableName,
  columns: TColumnsMap | ((columnTypes: PgColumnsBuilders) => TColumnsMap),
  extraConfig?: (
    self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'pg'>,
  ) => PgTableExtraConfigValue[],
): OnchainTable<{
  name: TTableName
  schema: undefined
  columns: BuildColumns<TTableName, TColumnsMap, 'pg'>
  dialect: 'pg'
}> {
  const table = pgTable(
    name,
    columns as TColumnsMap,
    extraConfig,
  ) as PgTableWithColumns<{
    name: TTableName
    schema: undefined
    columns: BuildColumns<TTableName, TColumnsMap, 'pg'>
    dialect: 'pg'
  }>

  Object.defineProperty(table, ONCHAIN_TABLE_MARKER, {
    value: true,
    enumerable: false,
    writable: false,
  })

  return table as OnchainTable<{
    name: TTableName
    schema: undefined
    columns: BuildColumns<TTableName, TColumnsMap, 'pg'>
    dialect: 'pg'
  }>
}

/** Runtime check: returns `true` if `table` was created via `onchainTable`. */
export function isOnchainTable(table: unknown): table is OnchainTable {
  return (
    typeof table === 'object' &&
    table !== null &&
    ONCHAIN_TABLE_MARKER in table &&
    (table as Record<symbol, unknown>)[ONCHAIN_TABLE_MARKER] === true
  )
}
