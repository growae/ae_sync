// Table builder
export { onchainTable, isOnchainTable } from './onchain.js'

// Drizzle column builders (re-exported for user convenience)
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
} from './onchain.js'

// Drizzle index / constraint builders
export { index, uniqueIndex, primaryKey } from './onchain.js'

// Aeternity-specific column helpers
export { aeAddress, aeAmount, aeTxHash, aeBlockHash } from './columns.js'

// Internal framework tables
export {
  aesyncMeta,
  aesyncContractState,
  aesyncCheckpoint,
} from './internal.js'

// Types
export {
  ONCHAIN_TABLE_MARKER,
  type OnchainTable,
  type SchemaDefinition,
  type InferTableInsert,
  type InferTableSelect,
  type TableColumnNames,
  type ResolveColumns,
} from './types.js'
