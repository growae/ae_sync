// @growae/aesync public API
export const VERSION = '0.0.1'

export {
  parseAci,
  parseSophiaType,
  computeEventHash,
  eventHashHex,
  decodeEventArgs,
  sophiaTypeToTs,
  generateEventTypes,
} from '../aci/index.js'

export type {
  AciContract,
  AciEntrypoint,
  AciEvent,
  AciEventField,
  SophiaType,
  SophiaToTs,
} from '../aci/index.js'

// Schema
export {
  onchainTable,
  isOnchainTable,
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
  index,
  uniqueIndex,
  primaryKey,
  aeAddress,
  aeAmount,
  aeTxHash,
  aeBlockHash,
  aesyncMeta,
  aesyncContractState,
  aesyncCheckpoint,
  ONCHAIN_TABLE_MARKER,
  type OnchainTable,
  type SchemaDefinition,
  type InferTableInsert,
  type InferTableSelect,
  type TableColumnNames,
  type ResolveColumns,
} from '../schema/index.js'

export { createConfig } from '../config/index.js'
export type {
  AeSyncConfig,
  ContractConfig,
  CreateConfigParameters,
  DatabaseConfig,
  FactoryConfig,
  NetworkConfig,
} from '../config/index.js'

// Database
export { createDatabase } from '../database/index.js'
export {
  createShadowTables,
  revertToHeight,
  pruneFinalized,
} from '../database/index.js'
export type { Database, DrizzleInstance } from '../database/index.js'

// MDW client
export {
  createMdwClient,
  createMdwHttpClient,
  createMdwWebSocket,
  extractCursor,
  MdwConnectionError,
  MdwError,
  MdwHttpError,
  MdwTimeoutError,
  paginateAll,
  paginateWithLimit,
} from '../mdw/index.js'
export type {
  GetAex9TransfersOptions,
  GetContractCallsOptions,
  GetContractLogsOptions,
  MdwAex9Token,
  MdwAex9Transfer,
  MdwClient,
  MdwClientConfig,
  MdwContractCall,
  MdwContractLog,
  MdwHttpClient,
  MdwHttpClientOptions,
  MdwKeyBlock,
  MdwPaginatedResponse,
  MdwStatus,
  MdwWebSocketClient,
  MdwWebSocketEvents,
  MdwWebSocketOptions,
  PaginationOptions,
} from '../mdw/index.js'

// Server
export { createServer } from '../server/index.js'
export type {
  ContractSyncStatus,
  ServerConfig,
  SyncStatusProvider,
} from '../server/index.js'

// GraphQL
export {
  graphqlMiddleware,
  buildGraphQLSchema,
} from '../graphql/index.js'
