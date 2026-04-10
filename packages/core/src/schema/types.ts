import type { BuildColumns } from 'drizzle-orm/column-builder'
import type { PgColumnBuilderBase } from 'drizzle-orm/pg-core/columns/common'
import type { PgTableWithColumns, TableConfig } from 'drizzle-orm/pg-core/table'

/** Symbol used to mark tables created via `onchainTable` */
export const ONCHAIN_TABLE_MARKER = Symbol.for('aesync.onchainTable')

/** Return type of `onchainTable` — a Drizzle `PgTableWithColumns` branded with the marker. */
export type OnchainTable<T extends TableConfig = TableConfig> =
  PgTableWithColumns<T> & { [ONCHAIN_TABLE_MARKER]: true }

/** A user's full schema: a record of named `OnchainTable` instances. */
export type SchemaDefinition = Record<string, OnchainTable>

/** Extract the insert-row type for a given table. */
export type InferTableInsert<T extends PgTableWithColumns<TableConfig>> =
  T extends PgTableWithColumns<infer C>
    ? {
        [K in keyof C['columns']]: C['columns'][K]['_']['notNull'] extends true
          ? C['columns'][K]['_']['data']
          : C['columns'][K]['_']['data'] | null
      }
    : never

/** Extract the select-row type for a given table. */
export type InferTableSelect<T extends PgTableWithColumns<TableConfig>> =
  T extends PgTableWithColumns<infer C>
    ? { [K in keyof C['columns']]: C['columns'][K]['_']['data'] }
    : never

/** Extract column names from a table as a union of string literals. */
export type TableColumnNames<T extends PgTableWithColumns<TableConfig>> =
  T extends PgTableWithColumns<infer C> ? keyof C['columns'] & string : never

/** Utility: extract the built columns map from a columns builder map. */
export type ResolveColumns<
  TName extends string,
  TCols extends Record<string, PgColumnBuilderBase>,
> = BuildColumns<TName, TCols, 'pg'>
